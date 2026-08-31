'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { uploader, type Snapshot } from '@/lib/media/uploader';

/**
 * Holds the upload queue for the whole app.
 *
 * It lives in the root layout on purpose: the engine is a module-level
 * singleton, so a guest can start a 2GB video on the upload page, wander
 * over to the gallery, and the transfer carries on. Only a full page load
 * interrupts it — and the queue is persisted, so even that resumes.
 */
interface UploadApi extends Snapshot {
  add: (files: File[]) => void;
  cancel: (localId: string) => void;
  retry: (localId: string) => void;
  clearFinished: () => void;
}

const empty: Snapshot = {
  tasks: [],
  activeCount: 0,
  doneCount: 0,
  sent: 0,
  total: 0,
  completions: 0,
};

const Ctx = createContext<UploadApi | null>(null);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(empty);

  useEffect(() => {
    const engine = uploader();
    const off = engine.subscribe(setSnap);
    void engine.boot();
    return off;
  }, []);

  // Closing the tab mid-upload loses the rest of the transfer, so say so.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!uploader().hasWork()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const value = useMemo<UploadApi>(
    () => ({
      ...snap,
      add: (files) => uploader().add(files),
      cancel: (id) => uploader().cancel(id),
      retry: (id) => uploader().retry(id),
      clearFinished: () => uploader().clearFinished(),
    }),
    [snap],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUploads(): UploadApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUploads outside UploadProvider');
  return ctx;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
