'use client';

import { useEffect, useRef } from 'react';
import { Application, RenderTexture, Sprite } from 'pixi.js';
import { buildScene } from '@/lib/pixel/scene';
import { C, INTEGER_SCALE, WORLD_H, WORLD_W } from '@/lib/pixel/palette';

/**
 * The scene is drawn into a WORLD_W x WORLD_H render texture, then that
 * texture is blown up with nearest-neighbour filtering. Everything inside the world —
 * rotated arms, swinging dreads, drifting petals — lands on the low-res grid,
 * so the pixels stay honest instead of turning into smooth vector shapes.
 */
export default function WeddingCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      const a = new Application();
      await a.init({
        background: C.bgLow,
        antialias: false,
        resizeTo: host,
        roundPixels: true,
        autoDensity: true,
        resolution: 1,
      });

      if (disposed) {
        a.destroy(true, { children: true });
        return;
      }

      app = a;
      host.appendChild(a.canvas);

      const scene = buildScene();
      // The wall, arch, floor and riser are static and enormous (a hundred
      // thousand-odd rectangles at this resolution). Baking them into one
      // texture means the per-frame work is the dancers, the lights and the
      // petals only.
      try {
        scene.still.cacheAsTexture(true);
      } catch {
        // If the renderer cannot bake it, draw it live — slower, identical.
      }
      const frame = RenderTexture.create({ width: WORLD_W, height: WORLD_H, antialias: false });
      frame.source.scaleMode = 'nearest';

      const screen = new Sprite(frame);
      screen.anchor.set(0.5);
      a.stage.addChild(screen);

      const layout = () => {
        const raw = Math.min(a.screen.width / WORLD_W, a.screen.height / WORLD_H);
        const scale = INTEGER_SCALE ? Math.max(1, Math.floor(raw)) : raw;
        screen.scale.set(scale);
        screen.position.set(Math.round(a.screen.width / 2), Math.round(a.screen.height / 2));
      };
      layout();
      a.renderer.on('resize', layout);

      let t = 0;
      a.ticker.add((ticker) => {
        if (!reduced) t += ticker.deltaMS / 1000;
        scene.update(t);
        a.renderer.render({ container: scene.view, target: frame });
      });
    })();

    return () => {
      disposed = true;
      app?.destroy(true, { children: true, texture: true });
      app = null;
    };
  }, []);

  return <div ref={hostRef} className="canvas-host" aria-hidden="true" />;
}
