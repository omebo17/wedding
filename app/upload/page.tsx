'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { apiConfigured } from '@/lib/media/api';
import { formatBytes, useUploads } from '@/components/UploadProvider';

const LABEL: Record<string, string> = {
  queued: 'Waiting',
  uploading: 'Uploading',
  finishing: 'Finishing',
  done: 'On the wall',
  error: 'Failed',
  canceled: 'Canceled',
};

export default function UploadPage() {
  const { tasks, add, cancel, retry, clearFinished, sent, total } = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const configured = apiConfigured();

  const take = (list: FileList | null) => {
    if (!list || !configured) return;
    const files = Array.from(list).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    );
    if (files.length > 0) add(files);
  };

  const finished = tasks.filter((t) => t.status === 'done' || t.status === 'canceled').length;
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  return (
    <main className="page">
      <header className="page__head">
        <Link className="back" href="/">
          ← Oto &amp; Mari
        </Link>
        <h1>Add your photos</h1>
        <p className="page__lede">
          Full quality, straight from your phone — nothing is compressed or resized on the way.
          Videos are welcome, however long. Keep this tab open while they go up; you can look
          through the <Link href="/gallery">gallery</Link> in the meantime.
        </p>
      </header>

      {!configured && (
        <p className="notice">
          <strong>Uploads are not switched on yet.</strong> Deploy the backend
          (<code>cd backend &amp;&amp; sam deploy --guided</code>), put the <code>ApiUrl</code> it
          prints into <code>.env.local</code> as <code>NEXT_PUBLIC_MEDIA_API</code>, and restart{' '}
          <code>npm run dev</code> — the variable is read at startup, so a hot reload will not pick
          it up.
        </p>
      )}

      <div
        className={`drop${dragging ? ' drop--over' : ''}${configured ? '' : ' drop--off'}`}
        aria-disabled={!configured}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
      >
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="drop__hint">
          {configured ? 'Drag photos and videos here' : 'Waiting on the upload service'}
        </p>
        <button
          className="btn btn--primary"
          type="button"
          disabled={!configured}
          onClick={() => input.current?.click()}
        >
          Choose files
        </button>
      </div>

      {tasks.length > 0 && (
        <section className="queue" aria-label="Upload queue">
          <div className="queue__head">
            <h2>
              {tasks.length} {tasks.length === 1 ? 'file' : 'files'} · {pct}%
            </h2>
            {finished > 0 && (
              <button className="link" type="button" onClick={clearFinished}>
                Clear finished
              </button>
            )}
          </div>

          <ul className="queue__list">
            {tasks.map((t) => {
              const filePct = t.size > 0 ? Math.min(100, Math.round((t.sent / t.size) * 100)) : 0;
              return (
                <li key={t.localId} className={`row row--${t.status}`}>
                  <span className="row__kind" aria-hidden="true">
                    {t.kind === 'video' ? '▶' : '▣'}
                  </span>
                  <span className="row__body">
                    <span className="row__name" title={t.name}>
                      {t.name}
                    </span>
                    <span className="row__meta">
                      {LABEL[t.status]}
                      {t.resumed && t.status === 'queued' ? ' · resumed' : ''} ·{' '}
                      {formatBytes(t.sent)} / {formatBytes(t.size)}
                      {t.error ? ` · ${t.error}` : ''}
                    </span>
                    <span className="row__bar" aria-hidden="true">
                      <span style={{ width: `${t.status === 'done' ? 100 : filePct}%` }} />
                    </span>
                  </span>
                  {t.status === 'error' || t.status === 'canceled' ? (
                    <button className="link" type="button" onClick={() => retry(t.localId)}>
                      Retry
                    </button>
                  ) : t.status === 'done' ? (
                    <span className="row__tick" aria-hidden="true">
                      ✓
                    </span>
                  ) : (
                    <button className="link" type="button" onClick={() => cancel(t.localId)}>
                      Cancel
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
