/**
 * Thin client for the media API. One place that knows the URL shapes, so
 * the uploader and the gallery cannot drift apart.
 */

const BASE = (process.env.NEXT_PUBLIC_MEDIA_API ?? '').replace(/\/+$/, '');

export interface InitSingle {
  mode: 'single';
  id: string;
  key: string;
  sk: string;
  url: string;
}

export interface InitMultipart {
  mode: 'multipart';
  id: string;
  key: string;
  sk: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  urls: Array<{ partNumber: number; url: string }>;
}

export type InitResult = InitSingle | InitMultipart;

export interface FeedItem {
  id: string;
  sk: string;
  kind: 'image' | 'video';
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: number;
  thumbUrl: string | null;
  url: string;
}

export function apiConfigured(): boolean {
  return BASE.length > 0;
}

export class NotConfiguredError extends Error {
  constructor() {
    super('Uploads are not switched on yet — the site has no media API configured.');
    this.name = 'NotConfiguredError';
  }
}

/**
 * Without this, an unset NEXT_PUBLIC_MEDIA_API makes every call a relative
 * fetch: the request goes to the site itself, Next answers with its 404
 * page, and the guest is shown a screenful of HTML instead of a reason.
 */
function assertConfigured(): void {
  if (!BASE) throw new NotConfiguredError();
}

/** Whatever the server said, in one readable line. */
async function describeFailure(res: Response, path: string): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  let detail = '';
  if (type.includes('json')) {
    detail = await res
      .json()
      .then((body: unknown) =>
        typeof body === 'object' && body && 'error' in body ? String((body as { error: unknown }).error) : '',
      )
      .catch(() => '');
  } else if (type.startsWith('text/plain')) {
    detail = (await res.text().catch(() => '')).slice(0, 120);
  }
  // An HTML body means we reached the wrong server; saying so is more use
  // than quoting the markup.
  if (!detail && type.includes('html')) {
    detail = 'the request reached the website instead of the media API';
  }
  return `${path} failed (${res.status})${detail ? `: ${detail}` : ''}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  assertConfigured();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await describeFailure(res, path));
  return (await res.json()) as T;
}

export const initUpload = (file: { name: string; type: string; size: number }) =>
  post<InitResult>('/upload/init', {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  });

export const signParts = (key: string, uploadId: string, from: number, to: number) =>
  post<{ urls: Array<{ partNumber: number; url: string }> }>('/upload/parts', {
    key,
    uploadId,
    from,
    to,
  });

export const completeUpload = (args: {
  id: string;
  key: string;
  sk: string;
  uploadId?: string;
  parts?: Array<{ partNumber: number; etag: string }>;
}) => post<{ ok: true }>('/upload/complete', args);

export const abortUpload = (args: { key: string; sk: string; uploadId?: string }) =>
  post<{ ok: true }>('/upload/abort', args);

export const posterTarget = (args: {
  id: string;
  sk: string;
  width: number;
  height: number;
  duration: number;
}) => post<{ url: string; key: string }>('/poster', args);

export async function fetchFeed(cursor?: string | null): Promise<{
  items: FeedItem[];
  cursor: string | null;
}> {
  assertConfigured();
  const url = new URL(`${BASE}/media`);
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(await describeFailure(res, '/media'));
  return (await res.json()) as { items: FeedItem[]; cursor: string | null };
}
