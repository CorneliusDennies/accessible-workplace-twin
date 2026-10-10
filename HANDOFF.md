# Project Handoff — Accessible Workplace Twin

Context for picking up this project in a fresh Claude Code session. Read this
first, then explore the code as needed.

## What this is

Hackathon project (Track: Accessible Workplace Twin). B2B product idea: help
companies find and fix accessibility gaps in their workplace for disabled
employees. Flow: get a representation of the workplace in 3D → flag
accessibility issues for a chosen disability type → show recommended fixes in
the 3D model → produce a bill of materials (BOM) with costs and citations to
real standards (ADA, ICC A117.1).

Repo: https://github.com/CorneliusDennies/accessible-workplace-twin (private)

## Stack

- **Frontend**: Vite + React + TypeScript + react-three-fiber (Three.js) for
  the 3D scene. No router, no state library — plain `useState`/`useMemo` in
  `src/components/App.tsx`.
- **Backend** (`server/`): Node + Express + TypeScript, run with `tsx`. Exists
  only to do things the browser can't: call external APIs with secret keys,
  and run `ffmpeg`.
- Both packages have their own `package.json`/`tsconfig.json`, run
  independently (`npm run dev` in each).

## Architecture: modular disability "plug-ins"

Core data model (`src/types.ts`): `OfficeData` (rooms/walls/doors/obstacles/
stairs), `Issue`, `Fix`, `Product`, and a `Module` interface:
`{ id, name, analyze(officeData): Issue[], fixesFor(issue): Fix[] }`.

Each disability type is a folder under `src/modules/<id>/` (`rules.ts`,
`fixes.ts`, `products.ts`, `index.ts`), registered in
`src/modules/registry.ts`. Two modules exist today:

- `blindLowVision` — tactile paving at stairs, braille signage at doors,
  contrast strips (cites ADA §705, ICC A117.1 §703, ADA §504.4).
- `mobilityWheelchair` — wheelchair ramp at stairs, door widening, clear floor
  marking (cites ADA §405, §404.2.3, §403.5). Its obstacle-clearance rule
  computes corridor width generically from flanking walls rather than
  hardcoding coordinates.

Adding a third module = one new folder + one registry line. The rules engine
(`src/engine/analyzeOffice.ts`) is a one-line pass-through by design, so it
could later move server-side with no logic changes.

## Three ways to get a workplace into the system

All three ultimately produce/update the same `OfficeData` object, which is
what drives the rules engine and BOM — this is the important unifying design:

1. **Hardcoded sample office** (`src/data/sampleOffice.ts`) — default on load.
2. **2D room editor** (`src/components/RoomEditor.tsx`) — click-to-draw
   walls/doors/stairs/obstacles on a top-down SVG grid. Opened via "Edit
   workplace layout". This is the primary, most reliable input method.
3. **AI floor-plan photo import** — upload a photo/scan of an existing floor
   plan; `server/src/floorplan.ts` calls **Gemini** (`gemini-flash-latest`)
   with vision input + a JSON schema (`responseMimeType`/`responseJsonSchema`)
   forcing structured wall/door/stair/obstacle extraction, converted to
   `OfficeData` by `server/src/convertFloorPlan.ts`, then opened in the 2D
   editor for review before applying. Has retry/backoff for Gemini's
   transient 503s (3 retries, exponential 1s/2s/4s — verified against the
   real API, which does genuinely 503 sometimes on the free tier).

Plus a **secondary/demo feature**: video walkthrough → 3D scan via **KIRI
Engine's** photogrammetry API (`server/src/kiri.ts`: extract frames with
ffmpeg → upload → poll status → download GLB → render with
`@react-three/drei`'s `Bounds` for auto-fit camera). This produces a
photorealistic mesh but **no structured data** — it doesn't know what's a
door or a staircase. That gap is why the 3D tagging tool below exists.

## 3D click-to-tag tool

The feature that unifies everything: a toolbar above the 3D view
(`src/components/TagToolbar.tsx`) lets you click directly on **any** rendered
model — procedural or scanned GLB — to tag a point as a door/stairs/obstacle.
Tagged elements become real `OfficeData` entries (`App.tsx`
`handleTagPlaced`/`handleTagErased`), so they flow through the exact same
rules engine as everything else. This means a video scan *can* now drive the
analysis, via manual tagging on top of it.

Door placement (2D editor, 3D tag tool, and floor-plan import) snaps onto the
nearest wall via `src/utils/wallGeometry.ts` (`findNearestWall`), and stores
which way that wall runs (`Door.horizontal`) so the door renders with the
correct orientation. Door thickness (0.3) is deliberately thicker than wall
thickness (0.2) — a door exactly as thin as or thinner than the wall gets
fully swallowed inside it and becomes invisible. (This was a real bug found
and fixed this session — worth knowing if doors ever go missing again after
a future change to wall/door dimensions.)

## Secrets / API keys

`server/.env` (gitignored, not in the repo — your friend needs their own):
```
KIRI_API_KEY=...       # kiriengine.app, 10 free credits then $1/scan
GEMINI_API_KEY=...     # aistudio.google.com/apikey, free tier
PORT=4000
```
`server/.env.example` documents the required keys with empty values.

## Known gotchas

- **KIRI Engine's API docs show `code: 0` for success; the live API actually
  returns `code: 200`.** We check `res.data.ok` instead of `code` — don't
  revert to checking `code === 0`.
- **Gemini free tier genuinely 503s under load** — the retry/backoff in
  `floorplan.ts` is load-bearing, not defensive overkill.
- **Web-fetched docs for `@google/genai` were partially hallucinated**
  (invented a model `gemini-3.8-flash` and wrong field names) during
  research — when in doubt, check the installed package's `.d.ts` files
  directly (`server/node_modules/@google/genai/dist/genai.d.ts`) rather than
  trusting scraped docs.
- **3D tagging erase mode**: clicking "the same pixel" you used to place a
  tag will usually *not* hit it for erase — elevated objects project to a
  different screen pixel than their ground point, due to ordinary
  perspective projection. Click what you actually *see* rendered, not where
  you originally clicked to place it. Not a bug, just how 3D raycasting works.

## Running it

```sh
npm run dev              # frontend, port 5173
cd server && npm run dev # backend, port 4000 (needs .env)
```

## What's not done / possible next steps

A prioritized improvement roadmap was discussed but not yet built:
- Quick wins: room-colored floors (the `rooms` field exists in `OfficeData`
  but isn't rendered), basic materials/lighting, GLB export button,
  undo/redo in the 2D editor.
- Medium: Gemini floor-plan import could also extract room boundaries/
  labels, not just walls/doors/stairs; a user-entered scale-calibration
  reference (e.g. "this wall is 4m") would fix scale guesses on both the
  floor-plan import and video scan paths.
- Only two disability modules exist; the architecture is designed so a third
  is cheap to add (one folder + one registry line).
