'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiConfigured, fetchFeed, type FeedItem } from '@/lib/media/api';
import { useUploads } from '@/components/UploadProvider';

export default function GalleryPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const { completions } = useUploads();
  const configured = apiConfigured();

  const loadMore = useCallback(
    async (reset = false) => {
      if (!configured || loading) return;
      setLoading(true);
      try {
        const page = await fetchFeed(reset ? null : cursor);
        setItems((prev) => {
          const merged = reset ? page.items : [...prev, ...page.items];
          const seen = new Set<string>();
          return merged.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
        });
        setCursor(page.cursor);
        setDone(!page.cursor);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'could not load the gallery');
      } finally {
        setLoading(false);
      }
    },
    [configured, cursor, loading],
  );

  // first page, and again whenever one of this guest's uploads lands
  useEffect(() => {
    void loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completions]);

  // infinite scroll
  useEffect(() => {
    const node = sentinel.current;
    if (!node || done) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadMore, done]);

  // lightbox keys
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') {
        setOpen((i) => (i === null ? i : Math.min(items.length - 1, i + 1)));
      }
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items.length]);

  const current = open === null ? null : items[open];

  return (
    <main className="page">
      <header className="page__head">
        <Link className="back" href="/">
          ← Oto &amp; Mari
        </Link>
        <h1>The gallery</h1>
        <p className="page__lede">
          Everything everyone has sent, newest first. <Link href="/upload">Add yours</Link>.
        </p>
      </header>

      {!configured && (
        <p className="notice">
          Set <code>NEXT_PUBLIC_MEDIA_API</code> in <code>.env.local</code> to see the wall.
        </p>
      )}
      {error && <p className="notice">{error}</p>}

      <div className="grid">
        {items.map((item, i) => (
          <button
            key={item.id}
            className="tile"
            type="button"
            onClick={() => setOpen(i)}
            aria-label={item.kind === 'video' ? 'Play video' : 'View photo'}
          >
            {item.thumbUrl ? (
              /* Thumbnails are pre-sized by the backend, so the grid stays
                 light on a phone; the original is only fetched on open. */
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumbUrl} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="tile__blank">{item.kind === 'video' ? '▶' : '▣'}</span>
            )}
            {item.kind === 'video' && (
              <span className="tile__badge" aria-hidden="true">
                ▶ {item.duration ? formatDuration(item.duration) : 'video'}
              </span>
            )}
          </button>
        ))}
      </div>

      {!done && (
        <div ref={sentinel} className="sentinel">
          {loading ? 'Loading…' : ''}
        </div>
      )}
      {done && items.length === 0 && configured && !error && (
        <p className="empty">Nothing on the wall yet. Be the first.</p>
      )}

      {current && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <button className="lightbox__close" type="button" aria-label="Close">
            ✕
          </button>
          <div className="lightbox__stage" onClick={(e) => e.stopPropagation()}>
            {current.kind === 'video' ? (
              <video
                key={current.id}
                src={current.url}
                poster={current.thumbUrl ?? undefined}
                controls
                autoPlay
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={current.id} src={current.url} alt="" />
            )}
          </div>
          <div className="lightbox__nav" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen((i) => Math.max(0, (i ?? 0) - 1))}>
              ← Previous
            </button>
            <a href={current.url} download>
              Download original
            </a>
            <button
              type="button"
              onClick={() => setOpen((i) => Math.min(items.length - 1, (i ?? 0) + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
