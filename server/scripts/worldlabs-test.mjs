// End-to-end World Labs test: video -> world -> GLB mesh, saved for the viewer.
//
//   node server/scripts/worldlabs-test.mjs path/to/walkthrough.mp4 [model]
//
// model: marble-1.0-draft (fast/cheap) | marble-1.0 | marble-1.1 (default) | marble-1.1-plus
// Output: public/demo/worldlabs-test.glb + data/worldlabs-test.json (world + timings).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.worldlabs.ai/marble/v1';

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, 'server/.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const KEY = process.env.WORLDLABS_API_KEY || env.WORLDLABS_API_KEY;
if (!KEY) throw new Error('WORLDLABS_API_KEY missing from server/.env');

const [videoPath, model = 'marble-1.1'] = process.argv.slice(2);
if (!videoPath) throw new Error('Usage: node server/scripts/worldlabs-test.mjs <video> [model]');

const MIME = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo' };
const ext = path.extname(videoPath).slice(1).toLowerCase();
const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
const log = (...a) => console.log(`[${elapsed()}]`, ...a);

async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { 'WLT-Api-Key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function poll(operationId, label) {
  for (let attempt = 0; ; attempt++) {
    let op;
    try {
      op = await api('GET', `/operations/${operationId}`);
    } catch (err) {
      // A just-created operation can 404 for a few seconds before it's visible.
      if (!String(err).includes('-> 404') || attempt > 6) throw err;
      await new Promise((r) => setTimeout(r, 5_000));
      continue;
    }
    if (op.error) throw new Error(`${label} failed: ${JSON.stringify(op.error)}`);
    if (op.done) return op;
    log(`${label}…`, JSON.stringify(op.metadata ?? {}));
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> ${res.status}`);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return fs.statSync(outPath).size;
}

const sizeMb = fs.statSync(videoPath).size / 1e6;
if (sizeMb > 100) throw new Error(`Video is ${sizeMb.toFixed(0)}MB; World Labs limit is 100MB`);

// 1. Upload the video as a media asset.
const prep = await api('POST', '/media-assets:prepare_upload', {
  file_name: path.basename(videoPath),
  kind: 'video',
  extension: ext,
});
const { media_asset_id } = prep.media_asset;
const { upload_url, upload_method = 'PUT', required_headers = {} } = prep.upload_info;
const put = await fetch(upload_url, {
  method: upload_method,
  headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream', ...required_headers },
  body: fs.readFileSync(videoPath),
});
if (!put.ok) throw new Error(`upload -> ${put.status}: ${await put.text()}`);
log(`uploaded ${sizeMb.toFixed(1)}MB as ${media_asset_id}`);

// 2. Generate the world.
const gen = await api('POST', '/worlds:generate', {
  display_name: `creel test ${new Date().toISOString().slice(0, 16)}`,
  model,
  world_prompt: { type: 'video', video_prompt: { source: 'media_asset', media_asset_id } },
});
log(`generating with ${model}, operation ${gen.operation_id}`);
const genOp = await poll(gen.operation_id, 'generating');
const world = genOp.response;
const genSeconds = (Date.now() - t0) / 1000;
log(`world ready: ${world.world_marble_url}`);
log('mesh assets:', JSON.stringify(world.assets?.mesh ?? {}));

// 3. Export a GLB mesh.
const exp = await api('POST', `/worlds/${world.world_id}:export`, { asset_type: 'mesh', format: 'glb' });
const expOp = exp.done ? exp : await poll(exp.operation_id, 'exporting mesh');
const glbUrl = expOp.response.url;
const outGlb = path.join(root, 'public/demo/worldlabs-test.glb');
const bytes = await download(glbUrl, outGlb);
log(`GLB saved to public/demo/worldlabs-test.glb (${(bytes / 1e6).toFixed(1)}MB)`);

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'data/worldlabs-test.json'),
  JSON.stringify(
    { model, video: path.basename(videoPath), generate_seconds: genSeconds, total_seconds: (Date.now() - t0) / 1000,
      generate_cost: genOp.cost, export_cost: expOp.cost, glb_url: glbUrl, glb_bytes: bytes, world },
    null,
    2
  )
);
log('done — details in data/worldlabs-test.json');
