import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';

/* ==================================================================== *
 * Thumbnailer.
 *
 * Fires when an original lands. It writes a small JPEG beside the file and
 * records the real dimensions — it never touches the original, so what the
 * guest uploaded is what stays in the bucket, byte for byte.
 *
 * Videos are not handled here on purpose: the browser that just picked the
 * file can already decode it, so it seeks a frame and uploads the poster
 * itself. That keeps an ffmpeg layer out of the stack entirely.
 * ==================================================================== */

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const BUCKET = process.env.MEDIA_BUCKET!;
const TABLE = process.env.MEDIA_TABLE!;

/** Long edge of the gallery thumbnail. Retina-sized for a 3-up phone grid. */
const THUMB = 720;

interface S3Event {
  Records?: Array<{ s3: { object: { key: string } } }>;
}

export async function handler(event: S3Event) {
  for (const record of event.Records ?? []) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const id = /originals\/([0-9a-f-]{36})\./.exec(key)?.[1];
    if (!id) {
      console.warn('key does not look like an upload', key);
      continue;
    }

    const ref = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `id#${id}`, sk: 'ref' } }));
    const feedSk = ref.Item?.feedSk as string | undefined;
    if (!feedSk) {
      console.warn('no index row for', id);
      continue;
    }
    const row = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: 'feed', sk: feedSk } }));
    if (row.Item?.kind !== 'image') continue;

    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const bytes = Buffer.from(await object.Body!.transformToByteArray());

      // rotate() with no argument applies the EXIF orientation and drops the
      // tag, which is what stops phone photos coming out sideways.
      const pipeline = sharp(bytes, { failOn: 'none' }).rotate();
      const meta = await pipeline.metadata();
      const thumb = await pipeline
        .resize({ width: THUMB, height: THUMB, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();

      const thumbKey = `thumbs/${id}.jpg`;
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: thumbKey,
          Body: thumb,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );

      const upright = (meta.orientation ?? 1) >= 5;
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { pk: 'feed', sk: feedSk },
          UpdateExpression: 'SET thumbKey = :t, width = :w, height = :h',
          ExpressionAttributeValues: {
            ':t': thumbKey,
            ':w': upright ? meta.height : meta.width,
            ':h': upright ? meta.width : meta.height,
          },
        }),
      );
    } catch (err) {
      // A thumbnail is a nicety. If sharp cannot read it — a raw file, an
      // exotic codec — the original is still in the bucket and still shows
      // in the gallery, just without a small version.
      console.error('thumbnail failed, leaving the original alone', { key, err });
    }
  }
}
