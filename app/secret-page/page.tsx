'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  adminList,
  adminPurge,
  adminRemove,
  adminRestore,
  adminRethumb,
  apiConfigured,
  UnauthorisedError,
  type FeedItem,
} from '@/lib/media/api';

/*
 * The moderation page. Not linked from anywhere — you get here by typing the
 * address — but being unlisted is not what protects it: the code below is, and
 * so is the token check on every API route it calls. A route name in a static
 * bundle is discoverable by anyone who looks.
 */

const KEY = 'wedding.admin.token';

type Tab = 'ready' | 'removed';

export default function SecretPage() {
  const configured = apiConfigured();
  const [token, setToken] = useState('');
  const [typed, setTyped] = useState('');
  const [tab, setTab] = useState<Tab>('ready');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // sk of the item whose delete is one click from happening
  const [armed, setArmed] = useState<string | null>(null);
  const [rebuilt, setRebuilt] = useState<string | null>(null);

  // Remember the code in this browser only, so a phone at the party does not
  // need it re-typed between checks.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved) setToken(saved);
    } catch {
      /* private window, or storage blocked — typing it each time still works */
    }
  }, []);

  const load = useCallback(
    async (state: Tab, next?: string | null) => {
      if (!token) return;
      setBusy(true);
      try {
        const page = await adminList(token, state, next ?? null);
        setItems((prev) => (next ? [...prev, ...page.items] : page.items));
        setCursor(page.cursor);
        setError(null);
      } catch (err) {
        if (err instanceof UnauthorisedError) {
          setToken('');
          try {
            window.localStorage.removeItem(KEY);
          } catch {
            /* nothing to clear */
          }
        }
        setError(err instanceof Error ? err.message : 'could not load');
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    setArmed(null);
    void load(tab);
  }, [tab, load]);

  async function rebuildThumbs() {
    setBusy(true);
    try {
      const r = await adminRethumb(token);
      setRebuilt(
        r.queued === 0
          ? 'Every photo already has a thumbnail.'
          : `Rebuilding ${r.queued} thumbnail${r.queued === 1 ? '' : 's'} — reload in a minute.`,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not start the rebuild');
    } finally {
      setBusy(false);
    }
  }

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    const t = typed.trim();
    if (!t) return;
    setToken(t);
    setTyped('');
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* not fatal — it just won't be remembered */
    }
  }

  function lock() {
    setToken('');
    setItems([]);
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  }

  /** Optimistically drop the row, since either tab it moves to isn't this one. */
  async function act(sk: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setItems((prev) => prev.filter((i) => i.sk !== sk));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'that did not work');
      void load(tab);
    } finally {
      setBusy(false);
      setArmed(null);
    }
  }

  if (!configured) {
    return (
      <main className="page">
        <h1>Moderation</h1>
        <p className="notice">
          Set <code>NEXT_PUBLIC_MEDIA_API</code> before using this page.
        </p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="page page--narrow">
        <header className="page__head">
          <h1>Moderation</h1>
          <p className="page__lede">Enter the code to manage what guests can see.</p>
        </header>
        <form className="gate" onSubmit={unlock}>
          <input
            type="password"
            className="gate__input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Code"
            autoComplete="current-password"
            autoFocus
          />
          <button className="btn btn--primary" type="submit">
            Unlock
          </button>
        </form>
        {error && <p className="notice">{error}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page__head">
        <Link className="back" href="/">
          ← Oto &amp; Mari
        </Link>
        <h1>Moderation</h1>
        <p className="page__lede">
          Hiding takes something off the wall straight away and keeps the file. Deleting is
          permanent, and only offered once an item is hidden.
        </p>
      </header>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === 'ready' ? 'tab--on' : ''}`}
          onClick={() => setTab('ready')}
        >
          On the wall
        </button>
        <button
          type="button"
          className={`tab ${tab === 'removed' ? 'tab--on' : ''}`}
          onClick={() => setTab('removed')}
        >
          Hidden
        </button>
        <button
          type="button"
          className="tab tab--quiet"
          disabled={busy}
          onClick={() => void rebuildThumbs()}
        >
          Rebuild thumbnails
        </button>
        <button type="button" className="tab tab--quiet" onClick={lock}>
          Forget code
        </button>
      </div>

      {error && <p className="notice">{error}</p>}
      {rebuilt && <p className="notice">{rebuilt}</p>}

      <div className="grid grid--admin">
        {items.map((item) => (
          <figure className="mod" key={item.sk}>
            <a className="mod__thumb" href={item.url} target="_blank" rel="noreferrer">
              {/* Without a preview here, picking the right photo to delete
                  means opening them one at a time. Falls back to the original
                  when the thumbnailer has not caught up. */}
              {item.thumbUrl ?? (item.kind === 'image' ? item.url : null) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbUrl ?? item.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="tile__blank">{item.kind === 'video' ? '▶' : '▣'}</span>
              )}
              {item.kind === 'video' && (
                <span className="tile__badge" aria-hidden="true">
                  ▶
                </span>
              )}
            </a>
            <figcaption className="mod__meta">
              {new Date(item.createdAt).toLocaleString()} · {formatSize(item.size)}
            </figcaption>
            <div className="mod__actions">
              {tab === 'ready' ? (
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={busy}
                  onClick={() => void act(item.sk, () => adminRemove(token, item.sk))}
                >
                  Hide
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={busy}
                    onClick={() => void act(item.sk, () => adminRestore(token, item.sk))}
                  >
                    Restore
                  </button>
                  {armed === item.sk ? (
                    <button
                      type="button"
                      className="btn btn--small btn--danger"
                      disabled={busy}
                      onClick={() => void act(item.sk, () => adminPurge(token, item.sk))}
                    >
                      Really delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--small btn--quiet"
                      disabled={busy}
                      onClick={() => setArmed(item.sk)}
                    >
                      Delete forever
                    </button>
                  )}
                </>
              )}
            </div>
          </figure>
        ))}
      </div>

      {!items.length && !busy && (
        <p className="empty">{tab === 'ready' ? 'Nothing on the wall yet.' : 'Nothing hidden.'}</p>
      )}

      {cursor && (
        <div className="sentinel">
          <button type="button" className="btn" disabled={busy} onClick={() => void load(tab, cursor)}>
            {busy ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </main>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
