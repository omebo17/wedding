import { randomUUID } from 'node:crypto';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

/* ==================================================================== *
 * The media API.
 *
 * Every byte a guest uploads goes straight from their phone to S3 with a
 * presigned URL. Lambda only ever signs URLs and keeps the index, which is
 * what makes a 4GB video cost the same in compute as a selfie — and means
 * the file arrives exactly as it left, with nothing in the middle to
 * re-encode it.
 *
 * Routes:
 *   POST /upload/init      start an upload, get a URL (or part URLs)
 *   POST /upload/parts     re-sign more part URLs for a long upload
 *   POST /upload/complete  stitch the parts, mark it visible
 *   POST /upload/abort     give up, bin the parts
 *   POST /poster           presign a PUT for a client-made video poster
 *   GET  /media?cursor=    the wall, newest first
 * ==================================================================== */

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const BUCKET = process.env.MEDIA_BUCKET!;
const TABLE = process.env.MEDIA_TABLE!;
const ORIGIN = process.env.SITE_ORIGIN || '*';
const SINGLE_SHOT_LIMIT = Number(process.env.SINGLE_SHOT_LIMIT_MB ?? 8) * 1024 * 1024;
const PART_SIZE = Number(process.env.PART_SIZE_MB ?? 16) * 1024 * 1024;

/** S3's own ceiling: 10,000 parts per upload. */
const MAX_PARTS = 10_000;
const MAX_SIZE = 200 * 1024 * 1024 * 1024;
/** How long a presigned PUT stays good. Long uploads re-sign as they go. */
const PUT_TTL = 60 * 60;
const GET_TTL = 60 * 60 * 6;
const PAGE = 24;

const FEED = 'feed';

type Json = Record<string, unknown>;

interface UrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  body?: string;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string; path?: string } };
}

const headers = {
  'content-type': 'application/json',
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'cache-control': 'no-store',
};

const reply = (status: number, body: Json) => ({
  statusCode: status,
  headers,
  body: JSON.stringify(body),
});

/**
 * Sort key that puts newest first without a secondary index: a fixed-width
 * countdown from a far-future millisecond, so ascending string order is
 * descending time order and one Query does the whole feed.
 */
const invertedStamp = (ms: number) => String(9_999_999_999_999 - ms).padStart(13, '0');

const kindOf = (contentType: string): 'image' | 'video' | null =>
  contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : null;

/** Keep the original extension; it costs nothing and helps when downloading. */
function extensionFor(filename: string, contentType: string): string {
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(filename || '')?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const fromType = contentType.split('/')[1]?.split(';')[0];
  return (fromType || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
}

function parseBody(event: UrlEvent): Json {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

async function init(body: Json) {
  const filename = String(body.filename ?? '');
  const contentType = String(body.contentType ?? '');
  const size = Number(body.size ?? 0);

  const kind = kindOf(contentType);
  if (!kind) return reply(415, { error: 'Only images and videos, please' });
  if (!Number.isFinite(size) || size <= 0) return reply(400, { error: 'size is required' });
  if (size > MAX_SIZE) return reply(413, { error: 'That file is enormous' });

  const id = randomUUID();
  const key = `originals/${id}.${extensionFor(filename, contentType)}`;
  const createdAt = Date.now();
  const sk = `${invertedStamp(createdAt)}#${id}`;

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: FEED, sk, id, key, kind, contentType, size, status: 'pending', createdAt },
    }),
  );
  // A pointer row keyed by id. The thumbnailer only knows the object key,
  // and without this it would have to scan the feed to find the row to
  // update.
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: { pk: `id#${id}`, sk: 'ref', feedSk: sk, key } }),
  );

  // Small enough to go in one shot: one URL, one PUT, done.
  if (size <= SINGLE_SHOT_LIMIT) {
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: PUT_TTL },
    );
    return reply(200, { mode: 'single', id, key, sk, url });
  }

  // Otherwise multipart: resumable, parallel, and each part retries on its
  // own instead of restarting a 3GB upload from zero.
  const partSize = Math.max(PART_SIZE, Math.ceil(size / MAX_PARTS));
  const partCount = Math.ceil(size / partSize);
  const created = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
  );

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: FEED, sk },
      UpdateExpression: 'SET uploadId = :u',
      ExpressionAttributeValues: { ':u': created.UploadId },
    }),
  );

  // Sign the first batch only. Signing 10,000 URLs up front would be slow
  // and most of them would expire before the upload reached them.
  const first = Math.min(partCount, 20);
  const urls = await signParts(key, created.UploadId!, 1, first);

  return reply(200, {
    mode: 'multipart',
    id,
    key,
    sk,
    uploadId: created.UploadId,
    partSize,
    partCount,
    urls,
  });
}

async function signParts(key: string, uploadId: string, from: number, to: number) {
  const out: Array<{ partNumber: number; url: string }> = [];
  for (let n = from; n <= to; n++) {
    out.push({
      partNumber: n,
      url: await getSignedUrl(
        s3,
        new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: n }),
        { expiresIn: PUT_TTL },
      ),
    });
  }
  return out;
}

async function parts(body: Json) {
  const key = String(body.key ?? '');
  const uploadId = String(body.uploadId ?? '');
  const from = Number(body.from ?? 0);
  const to = Number(body.to ?? 0);
  if (!key.startsWith('originals/') || !uploadId) return reply(400, { error: 'bad request' });
  if (!(from >= 1 && to >= from && to - from < 200)) return reply(400, { error: 'bad range' });
  return reply(200, { urls: await signParts(key, uploadId, from, to) });
}

async function complete(body: Json) {
  const id = String(body.id ?? '');
  const key = String(body.key ?? '');
  const uploadId = body.uploadId ? String(body.uploadId) : undefined;
  const sk = String(body.sk ?? '');
  const tags = Array.isArray(body.parts) ? body.parts : [];

  if (!id || !key.startsWith('originals/')) return reply(400, { error: 'bad request' });

  if (uploadId) {
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: (tags as Array<{ partNumber: number; etag: string }>)
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  // The thumbnailer flips this to ready when the thumb lands; marking it
  // uploaded here means a video with no poster still shows up.
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: FEED, sk },
      UpdateExpression: 'SET #s = :s, uploadedAt = :t REMOVE uploadId',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'ready', ':t': Date.now() },
    }),
  );
  return reply(200, { ok: true });
}

async function abort(body: Json) {
  const key = String(body.key ?? '');
  const uploadId = body.uploadId ? String(body.uploadId) : undefined;
  const sk = String(body.sk ?? '');
  if (!key.startsWith('originals/')) return reply(400, { error: 'bad request' });
  if (uploadId) {
    await s3
      .send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }))
      .catch(() => undefined);
  }
  if (sk) await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk: FEED, sk } }));
  return reply(200, { ok: true });
}

/**
 * Videos get their poster from the browser: it can already decode the file
 * it just picked, so one seek and a canvas draw gives a poster frame with no
 * ffmpeg layer anywhere near the stack.
 */
async function poster(body: Json) {
  const id = String(body.id ?? '');
  const sk = String(body.sk ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return reply(400, { error: 'bad id' });
  const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: FEED, sk } }));
  if (!existing.Item) return reply(404, { error: 'unknown item' });

  const key = `thumbs/${id}.jpg`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: 'image/jpeg' }),
    { expiresIn: PUT_TTL },
  );
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: FEED, sk },
      UpdateExpression: 'SET thumbKey = :k, width = if_not_exists(width, :w), height = if_not_exists(height, :h), duration = if_not_exists(duration, :d)',
      ExpressionAttributeValues: {
        ':k': key,
        ':w': Number(body.width ?? 0) || undefined,
        ':h': Number(body.height ?? 0) || undefined,
        ':d': Number(body.duration ?? 0) || undefined,
      },
    }),
  );
  return reply(200, { url, key });
}

async function feed(event: UrlEvent) {
  const cursorRaw = event.queryStringParameters?.cursor;
  let start: Record<string, unknown> | undefined;
  if (cursorRaw) {
    try {
      start = JSON.parse(Buffer.from(cursorRaw, 'base64url').toString('utf8'));
    } catch {
      return reply(400, { error: 'bad cursor' });
    }
  }

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': FEED, ':ready': 'ready' },
      FilterExpression: '#s = :ready',
      ExpressionAttributeNames: { '#s': 'status' },
      Limit: PAGE * 2,
      ExclusiveStartKey: start,
    }),
  );

  const items = await Promise.all(
    (res.Items ?? []).slice(0, PAGE).map(async (it) => ({
      id: it.id,
      sk: it.sk,
      kind: it.kind,
      contentType: it.contentType,
      size: it.size,
      width: it.width,
      height: it.height,
      duration: it.duration,
      createdAt: it.createdAt,
      // Both URLs are short-lived and per-request; nothing is public.
      thumbUrl: it.thumbKey
        ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: it.thumbKey }), {
            expiresIn: GET_TTL,
          })
        : null,
      url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: it.key }), {
        expiresIn: GET_TTL,
      }),
    })),
  );

  const cursor = res.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64url')
    : null;

  return reply(200, { items, cursor });
}

/* ------------------------------------------------------------------ */

export async function handler(event: UrlEvent) {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = (event.rawPath ?? event.requestContext?.http?.path ?? '/').replace(/\/+$/, '');

  if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  try {
    if (method === 'GET' && (path === '' || path === '/media')) return await feed(event);
    if (method === 'POST') {
      const body = parseBody(event);
      if (path === '/upload/init') return await init(body);
      if (path === '/upload/parts') return await parts(body);
      if (path === '/upload/complete') return await complete(body);
      if (path === '/upload/abort') return await abort(body);
      if (path === '/poster') return await poster(body);
    }
    return reply(404, { error: 'no such route' });
  } catch (err) {
    console.error('api failed', { path, method, err });
    return reply(500, { error: 'something went wrong' });
  }
}
