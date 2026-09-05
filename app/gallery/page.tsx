'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiConfigured, fetchFeed, type FeedItem } from '@/lib/media/api';
import { useUploads } from '@/components/UploadProvider';

/** How close to the end of the loaded list before we fetch the next page. */
const PREFETCH_MARGIN = 3;

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

  const atStart = open !== null && open === 0;
  const atEnd = open !== null && open >= items.length - 1 && done;

  const step = useCallback(
    (delta: number) => {
      setOpen((i) => {
        if (i === null) return i;
        const next = i + delta;
        if (next < 0 || next > items.length - 1) return i;
        return next;
      });
    },
    [items.length],
  );

  // Paging past the end of the loaded list would otherwise dead-end on an
  // arrow press even though the feed has more, so top it up as we approach.
  useEffect(() => {
    if (open === null || done || loading) return;
    if (open >= items.length - PREFETCH_MARGIN) void loadMore();
  }, [open, items.length, done, loading, loadMore]);

  // keyboard
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step]);

  // The body must not scroll behind the lightbox, or a phone drags the wall
  // around under the photo.
  useEffect(() => {
    if (open === null) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prior;
    };
  }, [open]);

  const current = open === null ? null : items[open];

  // Warm the neighbours so an arrow press paints immediately instead of
  // showing a gap while the full-size file downloads.
  useEffect(() => {
    if (open === null) return;
    for (const i of [open + 1, open - 1]) {
      const neighbour = items[i];
      if (neighbour?.kind === 'image') new Image().src = neighbour.url;
    }
  }, [open, items]);

  // Touch: a horizontal drag pages, a vertical one is left to the browser.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };

  const counter = useMemo(
    () => (open === null ? '' : `${open + 1} / ${items.length}${done ? '' : '+'}`),
    [open, items.length, done],
  );

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
        {items.map((item, i) => {
          /* The thumbnail is made by a Lambda a second or two after the
             upload lands, so a fresh photo has none yet — and if that Lambda
             ever fails, it never will. Falling back to the original keeps the
             wall full of pictures instead of blank squares; the browser
             scales it down and caches it. */
          const preview = item.thumbUrl ?? (item.kind === 'image' ? item.url : null);
          return (
            <button
              key={item.id}
              className="tile"
              type="button"
              onClick={() => setOpen(i)}
              aria-label={item.kind === 'video' ? 'Play video' : 'View photo'}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="tile__blank">{item.kind === 'video' ? '▶' : '▣'}</span>
              )}
              {item.kind === 'video' && (
                <span className="tile__badge" aria-hidden="true">
                  ▶ {item.duration ? formatDuration(item.duration) : 'video'}
                </span>
              )}
            </button>
          );
        })}
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

          <div className="lightbox__viewer" onClick={(e) => e.stopPropagation()}>
            <button
              className="lightbox__arrow lightbox__arrow--prev"
              type="button"
              aria-label="Previous"
              disabled={atStart}
              onClick={() => step(-1)}
            >
              ‹
            </button>

            <div
              className="lightbox__stage"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
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
                /* The thumbnail is already in cache from the grid, so painting
                   it behind the original turns a five-second top-to-bottom
                   reveal into an instant picture that sharpens. width/height
                   are what make it work: they give the element its box before
                   a single byte of the original has arrived. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.id}
                  className="shot"
                  src={current.url}
                  width={current.width || undefined}
                  height={current.height || undefined}
                  style={
                    current.thumbUrl
                      ? { backgroundImage: `url("${current.thumbUrl}")` }
                      : undefined
                  }
                  alt=""
                />
              )}
            </div>

            <button
              className="lightbox__arrow lightbox__arrow--next"
              type="button"
              aria-label="Next"
              disabled={atEnd}
              onClick={() => step(1)}
            >
              ›
            </button>
          </div>

          <div className="lightbox__bar" onClick={(e) => e.stopPropagation()}>
            <span className="lightbox__count">{counter}</span>
            <a href={current.url} download>
              Download original
            </a>
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
