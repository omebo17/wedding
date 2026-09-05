import {
  abortUpload,
  completeUpload,
  initUpload,
  NotConfiguredError,
  posterTarget,
  signParts,
  type InitResult,
} from './api';
import { makeImageThumb, makeVideoPoster } from './poster';
import { allUploads, dropUpload, saveUpload, type StoredUpload } from './store';

/* ==================================================================== *
 * Upload engine.
 *
 * What this has to get right:
 *
 *  - Nothing touches the pixels. Files go up as raw slices of the original
 *    Blob, so what lands in S3 is byte-identical to what came off the phone.
 *  - Big files survive. Anything over the single-shot limit is a multipart
 *    upload: parts go up in parallel, a failed part retries on its own
 *    rather than restarting the file, and an expired signature is re-signed
 *    on the spot.
 *  - It keeps going. The queue lives outside React, so navigating from the
 *    upload page to the gallery does not interrupt it, and every completed
 *    part is written to IndexedDB so a reload resumes instead of restarting.
 *
 * The one thing it cannot do is upload with the tab closed. Background
 * transfer without an open page needs a service worker with Background
 * Fetch, which Safari does not implement — so the UI tells guests to keep
 * the tab open rather than pretending.
 * ==================================================================== */

export type UploadStatus = 'queued' | 'uploading' | 'finishing' | 'done' | 'error' | 'canceled';

export interface UploadTask {
  localId: string;
  name: string;
  size: number;
  kind: 'image' | 'video';
  status: UploadStatus;
  /** Bytes confirmed on the wire. */
  sent: number;
  error?: string;
  resumed?: boolean;
}

export interface Snapshot {
  tasks: UploadTask[];
  activeCount: number;
  doneCount: number;
  sent: number;
  total: number;
  /** Bumped every time an upload finishes, so the gallery can refresh. */
  completions: number;
}

/** Whole files at once. Two keeps a phone's uplink busy without starving it. */
const FILE_CONCURRENCY = 2;
/** Parts of one file at once. */
const PART_CONCURRENCY = 4;
const ATTEMPTS = 4;

interface Live extends UploadTask {
  file: File;
  remote?: StoredUpload['remote'];
  parts: Map<number, string>;
  partSent: Map<number, number>;
  aborter: AbortController;
}

const kindOf = (type: string): 'image' | 'video' =>
  type.startsWith('video/') ? 'video' : 'image';

export class Uploader {
  private tasks = new Map<string, Live>();
  private listeners = new Set<(s: Snapshot) => void>();
  private running = 0;
  private completions = 0;
  private booted = false;

  /** Pick up anything a previous visit left unfinished. */
  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    const saved = (await allUploads()) ?? [];
    for (const rec of saved) {
      try {
        // Touch the file; if it has moved or been deleted this throws and the
        // record is useless.
        await rec.file.slice(0, 1).arrayBuffer();
      } catch {
        await dropUpload(rec.localId);
        continue;
      }
      const parts = new Map<number, string>();
      const partSent = new Map<number, number>();
      for (const p of rec.parts ?? []) {
        parts.set(p.partNumber, p.etag);
        partSent.set(p.partNumber, rec.remote?.partSize ?? 0);
      }
      this.tasks.set(rec.localId, {
        localId: rec.localId,
        name: rec.name,
        size: rec.size,
        kind: rec.kind,
        status: 'queued',
        sent: 0,
        resumed: true,
        file: rec.file,
        remote: rec.remote,
        parts,
        partSent,
        aborter: new AbortController(),
      });
    }
    this.emit();
    this.pump();
  }

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  add(files: File[]): void {
    for (const file of files) {
      const localId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      const task: Live = {
        localId,
        name: file.name || 'untitled',
        size: file.size,
        kind: kindOf(file.type),
        status: 'queued',
        sent: 0,
        file,
        parts: new Map(),
        partSent: new Map(),
        aborter: new AbortController(),
      };
      this.tasks.set(localId, task);
      void saveUpload({
        localId,
        file,
        name: task.name,
        size: task.size,
        kind: task.kind,
        createdAt: Date.now(),
      });
    }
    this.emit();
    this.pump();
  }

  retry(localId: string): void {
    const t = this.tasks.get(localId);
    if (!t || (t.status !== 'error' && t.status !== 'canceled')) return;
    t.status = 'queued';
    t.error = undefined;
    t.aborter = new AbortController();
    this.emit();
    this.pump();
  }

  cancel(localId: string): void {
    const t = this.tasks.get(localId);
    if (!t) return;
    t.aborter.abort();
    t.status = 'canceled';
    if (t.remote) {
      void abortUpload({ key: t.remote.key, sk: t.remote.sk, uploadId: t.remote.uploadId }).catch(
        () => undefined,
      );
    }
    void dropUpload(localId);
    this.emit();
  }

  clearFinished(): void {
    for (const [id, t] of this.tasks) {
      if (t.status === 'done' || t.status === 'canceled') this.tasks.delete(id);
    }
    this.emit();
  }

  hasWork(): boolean {
    for (const t of this.tasks.values()) {
      if (t.status === 'queued' || t.status === 'uploading' || t.status === 'finishing') return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */

  private snapshot(): Snapshot {
    const tasks: UploadTask[] = [];
    let sent = 0;
    let total = 0;
    let activeCount = 0;
    let doneCount = 0;
    for (const t of this.tasks.values()) {
      tasks.push({
        localId: t.localId,
        name: t.name,
        size: t.size,
        kind: t.kind,
        status: t.status,
        sent: t.sent,
        error: t.error,
        resumed: t.resumed,
      });
      if (t.status !== 'canceled') {
        total += t.size;
        sent += t.status === 'done' ? t.size : t.sent;
      }
      if (t.status === 'uploading' || t.status === 'finishing') activeCount++;
      if (t.status === 'done') doneCount++;
    }
    return { tasks, activeCount, doneCount, sent, total, completions: this.completions };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  private pump(): void {
    while (this.running < FILE_CONCURRENCY) {
      const next = [...this.tasks.values()].find((t) => t.status === 'queued');
      if (!next) return;
      this.running++;
      void this.run(next).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(t: Live): Promise<void> {
    t.status = 'uploading';
    this.emit();
    try {
      if (!t.remote) {
        const init: InitResult = await initUpload({
          name: t.name,
          type: t.file.type || 'application/octet-stream',
          size: t.size,
        });
        t.remote =
          init.mode === 'single'
            ? { id: init.id, key: init.key, sk: init.sk }
            : {
                id: init.id,
                key: init.key,
                sk: init.sk,
                uploadId: init.uploadId,
                partSize: init.partSize,
                partCount: init.partCount,
              };
        await this.persist(t);
        if (init.mode === 'single') {
          await this.putWhole(t, init.url);
        } else {
          await this.putParts(t, init.urls);
        }
      } else if (t.remote.uploadId) {
        await this.putParts(t, []);
      } else {
        // A single-shot upload whose URL is long gone: start it again. It is
        // under the single-shot limit, so this is cheap.
        const again = await initUpload({
          name: t.name,
          type: t.file.type || 'application/octet-stream',
          size: t.size,
        });
        if (again.mode !== 'single') throw new Error('unexpected mode on retry');
        t.remote = { id: again.id, key: again.key, sk: again.sk };
        await this.persist(t);
        await this.putWhole(t, again.url);
      }

      t.status = 'finishing';
      this.emit();
      await completeUpload({
        id: t.remote.id,
        key: t.remote.key,
        sk: t.remote.sk,
        uploadId: t.remote.uploadId,
        parts: [...t.parts.entries()].map(([partNumber, etag]) => ({ partNumber, etag })),
      });

      // Thumbnail last: the item is already on the wall by now, so a slow
      // or failed thumbnail never delays it appearing.
      await this.attachThumb(t).catch(() => undefined);

      t.status = 'done';
      t.sent = t.size;
      this.completions++;
      await dropUpload(t.localId);
    } catch (err) {
      // cancel() aborts the controller from outside this call stack, so the
      // signal is the truthful check here — the status field may not have
      // been written yet.
      if (t.aborter.signal.aborted) {
        t.status = 'canceled';
        return;
      }
      t.status = 'error';
      t.error = err instanceof Error ? err.message : 'upload failed';
      // A missing API is a setup state, not a fault: log it quietly so the
      // dev overlay does not light up red over a known-empty config.
      if (err instanceof NotConfiguredError) console.warn('upload skipped —', err.message);
      else console.error('upload failed', t.name, err);
    } finally {
      this.emit();
    }
  }

  private async persist(t: Live): Promise<void> {
    await saveUpload({
      localId: t.localId,
      file: t.file,
      name: t.name,
      size: t.size,
      kind: t.kind,
      createdAt: Date.now(),
      remote: t.remote,
      parts: [...t.parts.entries()].map(([partNumber, etag]) => ({ partNumber, etag })),
    });
  }

  private async putWhole(t: Live, url: string): Promise<void> {
    await withRetries(
      () =>
        rawPut(url, t.file, t.file.type || 'application/octet-stream', t.aborter.signal, (bytes) => {
          t.sent = bytes;
          this.emit();
        }),
      ATTEMPTS,
      t.aborter.signal,
    );
  }

  private async putParts(t: Live, presigned: Array<{ partNumber: number; url: string }>): Promise<void> {
    const remote = t.remote!;
    const partSize = remote.partSize!;
    const partCount = remote.partCount ?? Math.ceil(t.size / partSize);
    const urls = new Map(presigned.map((p) => [p.partNumber, p.url]));

    const pending = [];
    for (let n = 1; n <= partCount; n++) if (!t.parts.has(n)) pending.push(n);

    const recount = () => {
      let sum = 0;
      for (const v of t.partSent.values()) sum += v;
      t.sent = Math.min(sum, t.size);
      this.emit();
    };
    // Parts that were already done in a previous run count as sent.
    for (const n of t.parts.keys()) {
      t.partSent.set(n, Math.min(partSize, t.size - (n - 1) * partSize));
    }
    recount();

    const queue = pending.slice();
    const worker = async () => {
      for (;;) {
        const n = queue.shift();
        if (n === undefined) return;
        if (t.aborter.signal.aborted) throw new Error('canceled');
        const start = (n - 1) * partSize;
        const chunk = t.file.slice(start, Math.min(start + partSize, t.size));

        const etag = await withRetries(
          async () => {
            let url = urls.get(n);
            if (!url) {
              // Sign a window of parts around this one so a long upload keeps
              // fresh signatures without asking for 10,000 of them up front.
              const to = Math.min(partCount, n + 19);
              const res = await signParts(remote.key, remote.uploadId!, n, to);
              for (const p of res.urls) urls.set(p.partNumber, p.url);
              url = urls.get(n)!;
            }
            const { etag: tag } = await rawPut(url, chunk, undefined, t.aborter.signal, (bytes) => {
              t.partSent.set(n, bytes);
              recount();
            });
            if (!tag) throw new Error('S3 did not return an ETag — check the bucket CORS ExposedHeaders');
            return tag;
          },
          ATTEMPTS,
          t.aborter.signal,
          () => urls.delete(n),
        );

        t.parts.set(n, etag);
        t.partSent.set(n, chunk.size);
        recount();
        await this.persist(t);
      }
    };

    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, queue.length || 1) }, worker));
  }

  /**
   * Writes the gallery thumbnail: a seeked frame for video, a scaled copy for
   * a photo. Doing it here rather than only in the thumbnailer Lambda means
   * the wall stays light even if that function is down — without one, the
   * grid falls back to full-size originals and a phone downloads megabytes
   * per tile.
   */
  private async attachThumb(t: Live): Promise<void> {
    const poster = t.kind === 'video' ? await makeVideoPoster(t.file) : await makeImageThumb(t.file);
    if (!poster) return;
    const target = await posterTarget({
      id: t.remote!.id,
      sk: t.remote!.sk,
      width: poster.width,
      height: poster.height,
      duration: poster.duration,
    });
    await rawPut(target.url, poster.blob, 'image/jpeg', t.aborter.signal, () => undefined);
  }
}

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

/**
 * PUT a blob with progress. XHR rather than fetch: fetch still cannot report
 * upload progress in Safari, and progress is the whole point of the queue UI.
 */
function rawPut(
  url: string,
  body: Blob,
  contentType: string | undefined,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    // Only set what was signed. Adding a header S3 did not sign for breaks
    // the signature; for parts, nothing is signed but the URL itself.
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(body.size);
        resolve({ etag: (xhr.getResponseHeader('ETag') ?? '').replace(/"/g, '') || null });
      } else {
        const err = new Error(`PUT ${xhr.status}`) as Error & { status: number };
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error('timed out'));
    const onAbort = () => xhr.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    xhr.onloadend = () => signal.removeEventListener('abort', onAbort);
    xhr.send(body);
  });
}

async function withRetries<T>(
  fn: () => Promise<T>,
  attempts: number,
  signal: AbortSignal,
  onFail?: () => void,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (signal.aborted) throw new Error('canceled');
    try {
      return await fn();
    } catch (err) {
      last = err;
      onFail?.();
      const status = (err as { status?: number }).status;
      // 4xx that is not an expired signature will not fix itself.
      if (status && status !== 403 && status !== 408 && status < 500) throw err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i + Math.random() * 300));
    }
  }
  throw last instanceof Error ? last : new Error('failed');
}

/** One engine per tab, shared by every page. */
let singleton: Uploader | null = null;
export function uploader(): Uploader {
  if (!singleton) singleton = new Uploader();
  return singleton;
}
