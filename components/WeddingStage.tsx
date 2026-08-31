'use client';

import dynamic from 'next/dynamic';

// PixiJS needs a real canvas, so it never runs on the server.
const WeddingCanvas = dynamic(() => import('./WeddingCanvas'), {
  ssr: false,
  loading: () => <div className="canvas-host canvas-host--loading" aria-hidden="true" />,
});

export default function WeddingStage() {
  return <WeddingCanvas />;
}
