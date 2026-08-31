# wedding-pixel

Next.js + PixiJS. A 2D pixel-art dance floor: the couple dancing centre stage, a
rapper with dreads on the riser behind them with a mic, guests all around, blooms
overhead. Photo upload and gallery come later — this is the style pass.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run frame      # renders one frame to frame.png without a browser
```

## Why PixiJS

Three.js is a 3D scene graph. Pixi is the same idea for 2D: containers, sprites,
transforms, WebGL under the hood. Same mental model, no Z axis.

## How the pixel look is kept honest

Everything is drawn into a 1280×720 render texture at scale 1, then that texture is
blown up with nearest-neighbour filtering (`components/WeddingCanvas.tsx`). So a
rotated arm, a swinging dread, a drifting petal — all of it lands on the low-res
grid before it is magnified. Rendering at full resolution and shrinking would give
you smooth vector shapes wearing a pixel costume.

Antialiasing is off on the renderer, which is what keeps `Graphics` rectangles
hard-edged.

## Files

```
app/page.tsx                 hero: scene + title (names and date live here) + the two buttons
components/WeddingStage.tsx  client wrapper, loads Pixi with ssr: false
components/WeddingCanvas.tsx Pixi app, render texture, upscale, resize
lib/pixel/palette.ts         every colour, world size, BPM
lib/pixel/props.ts           guest tables: cloth, chairs, settings, centrepiece
lib/pixel/px.ts              rect/mask/joint helpers and the beat clock
lib/pixel/flowers.ts         blossoms, buds, leaves, vines
lib/pixel/characters.ts      groom, bride, rapper, crowd
lib/pixel/scene.ts           layout: backdrop, arch, floor, riser, speakers, crowd
preview/                     headless renderer used by `npm run frame`
```

## Tuning the art

- **Colours** — `lib/pixel/palette.ts`. The whole scene is a small fixed palette.
- **Tempo** — `BEAT` in the same file. Everything on stage moves to that clock.
- **Zoom / pixel size** — `WORLD_W` / `WORLD_H`. The world is 1280×720, so a
  world pixel is a quarter the size it was at 320×180 and art is authored with
  four times the detail. Smaller world = bigger, chunkier pixels.
- **People on or off** — `PEOPLE` in `lib/pixel/scene.ts`. False empties the
  room; the couple, rapper and guest rigs stay in `characters.ts` either way.
  They are still drawn for the old grid, so they render inside a container
  scaled by `PEOPLE_SCALE` until they are redrawn at 1280×720.
- **Tables** — the `createTable(x, y, scale, seed, number)` calls in
  `buildScene`. Position is where the front of the cloth meets the floor.
- **Chunkier pixels** — set `INTEGER_SCALE = true` for whole-number upscaling
  (perfectly square pixels, pink letterboxing on odd screen sizes).
- **Sprites** — characters are lists of `[x, y, w, h, colour]` rectangles relative
  to the character's feet. Flowers use `sprite()`, which turns an ASCII mask into
  pixels — edit the art by typing over the characters.
- **Animation** — each character returns `update(t)`. `wave()`, `hop()` and
  `beatPhase()` in `px.ts` are the only timing primitives used.

## Photo and video wall

Guests upload from their phones; everyone sees everything.

```
app/upload/page.tsx          picker, drag and drop, live queue
app/gallery/page.tsx         grid, infinite scroll, lightbox
components/UploadProvider    holds the queue above the pages
components/UploadDock        progress strip that follows you around
lib/media/uploader.ts        the engine: multipart, retries, resume
lib/media/poster.ts          browser-side video poster frames
lib/media/store.ts           IndexedDB, so a reload resumes
backend/                     SAM stack: S3 + DynamoDB + 2 Lambdas
```

Set it up:

```bash
cd backend && sam build --use-container && sam deploy --guided
cp .env.example .env.local   # paste the ApiUrl the deploy prints
```

Full quality is the point: files go up as raw slices of the original Blob,
so nothing is compressed, resized or re-encoded anywhere in the path.
Anything over 8MB becomes a multipart upload — parts in parallel, each
retrying on its own, and every finished part written to IndexedDB so a
reload picks up where it left off rather than starting the video again.

The queue lives in the root layout, so a guest can start a long video and
go browse the gallery while it uploads. The one thing it cannot do is
upload with the tab closed — that needs Background Fetch, which Safari does
not implement — so the UI asks them to keep the tab open instead of
pretending.

See `backend/README.md` for the architecture and the deploy details.

## Where the app functionality goes next

`/upload` and `/gallery` are linked from the hero but not built yet. The shape I'd
suggest when we get to it:

- a QR code on each table pointing at `/upload?table=7`
- `/upload` — camera/file picker, direct-to-storage upload, no account needed
- `/gallery` — everyone's photos, newest first, in the same pixel frame treatment

Nothing in `lib/pixel` needs to change for any of that; the scene is self-contained.
