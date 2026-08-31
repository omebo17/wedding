/**
 * Poster frame for a video, made in the browser.
 *
 * The browser has just been handed a file it can already decode, so one
 * seek and a canvas draw gives a gallery thumbnail — no server-side ffmpeg,
 * and the video itself is never re-encoded or even fully read.
 */
export interface Poster {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
}

export async function makeVideoPoster(file: File, longEdge = 720): Promise<Poster | null> {
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await withTimeout(once(video, 'loadedmetadata'), 8000);
    // A frame or so in: the very first frame of a phone video is often black
    // while exposure settles.
    const at = Math.min(video.duration || 1, Math.max(0.15, (video.duration || 1) * 0.08));
    video.currentTime = at;
    await withTimeout(once(video, 'seeked'), 8000);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const scale = Math.min(1, longEdge / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8),
    );
    if (!blob) return null;
    return { blob, width: vw, height: vh, duration: video.duration || 0 };
  } catch {
    // Some codecs (HEVC on the wrong browser, mostly) will not decode here.
    // The upload is unaffected; the tile just gets a film strip instead.
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

const once = (el: HTMLElement, event: string) =>
  new Promise<void>((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error(`${event} failed`));
    };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener('error', bad);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
