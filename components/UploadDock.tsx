'use client';

import Link from 'next/link';
import { formatBytes, useUploads } from './UploadProvider';

/**
 * A strip that follows the guest around while anything is uploading, so
 * they can browse the wall without wondering whether their video is still
 * going up.
 */
export default function UploadDock() {
  const { tasks, activeCount, doneCount, sent, total } = useUploads();
  const working = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'finishing',
  );
  const failed = tasks.filter((t) => t.status === 'error');
  if (working.length === 0 && failed.length === 0) return null;

  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  return (
    <div className="dock" role="status" aria-live="polite">
      <div className="dock__bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="dock__row">
        <strong>
          {working.length > 0
            ? `Uploading ${working.length} ${working.length === 1 ? 'file' : 'files'}`
            : 'Some uploads need another go'}
        </strong>
        <span className="dock__meta">
          {formatBytes(sent)} of {formatBytes(total)} · {pct}%
          {doneCount > 0 ? ` · ${doneCount} done` : ''}
          {activeCount > 0 ? '' : working.length > 0 ? ' · waiting' : ''}
        </span>
        <Link className="dock__link" href="/upload">
          Details
        </Link>
      </div>
    </div>
  );
}
