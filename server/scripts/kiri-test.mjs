// End-to-end KIRI Engine test: video -> photogrammetry -> GLB, saved for the viewer.
// Same video as worldlabs-test.mjs so the two can be compared side by side.
//
//   node server/scripts/kiri-test.mjs path/to/walkthrough.mp4
//
// Output: public/demo/kiri-test.glb + data/kiri-test.json (timings).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.kiriengine.app/api/v1/open';

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, 'server/.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const KEY = process.env.KIRI_API_KEY || env.KIRI_API_KEY;
if (!KEY) throw new Error('KIRI_API_KEY missing from server/.env');

const [videoPath] = process.argv.slice(2);
if (!videoPath) throw new Error('Usage: node server/scripts/kiri-test.mjs <video>');

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const auth = { Authorization: `Bearer ${KEY}` };

async function get(route, params) {
  const res = await fetch(`${API}${route}?${new URLSearchParams(params)}`, { headers: auth });
  const body = await res.json();
  if (!body.ok) throw new Error(`GET ${route} failed: ${JSON.stringify(body)}`);
  return body.data;
}

log('balance before:', (await get('/balance', {})).balance);

// KIRI caps input at 1920x1080 / 3 min — re-encode to fit (and drop audio).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiri-'));
const fitted = path.join(tmpDir, 'walkthrough.mp4');
execFileSync('ffmpeg', [
  '-v', 'error', '-y', '-i', videoPath, '-t', '180', '-an',
  '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
  '-c:v', 'libx264', '-crf', '20', fitted,
]);
const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fitted])
  .toString().trim().split(',').map(Number);
log(`re-encoded to ${w}x${h}, ${(fs.statSync(fitted).size / 1e6).toFixed(1)}MB`);

const form = new FormData();
form.append('videoFile', new Blob([fs.readFileSync(fitted)], { type: 'video/mp4' }), 'walkthrough.mp4');
form.append('modelQuality', '0'); // High
form.append('textureQuality', '1'); // 2K — keeps the GLB small enough for the browser
form.append('isMask', '0'); // a room, not an object — no masking
form.append('textureSmoothing', '1');
form.append('fileFormat', 'glb');

const upRes = await fetch(`${API}/photo/video`, { method: 'POST', headers: auth, body: form });
const up = await upRes.json();
if (!up.ok) throw new Error(`upload failed: ${JSON.stringify(up)}`);
const { serialize } = up.data;
log(`uploaded, serialize ${serialize}`);

const STATUS = { [-1]: 'uploading', 0: 'processing', 1: 'failed', 2: 'success', 3: 'queuing', 4: 'expired' };
for (;;) {
  const { status } = await get('/model/getStatus', { serialize });
  const name = STATUS[status] ?? status;
  if (name === 'success') break;
  if (name === 'failed' || name === 'expired') throw new Error(`KIRI job ${name}`);
  log(name + '…');
  await new Promise((r) => setTimeout(r, 15_000));
}
const processSeconds = (Date.now() - t0) / 1000;

const { modelUrl } = await get('/model/getModelZip', { serialize });
const zipPath = path.join(tmpDir, 'model.zip');
fs.writeFileSync(zipPath, Buffer.from(await (await fetch(modelUrl)).arrayBuffer()));
execFileSync('unzip', ['-o', '-q', zipPath, '-d', path.join(tmpDir, 'model')]);
const glbSrc = execFileSync('find', [path.join(tmpDir, 'model'), '-iname', '*.glb']).toString().trim().split('\n')[0];
if (!glbSrc) throw new Error('No .glb in KIRI archive');
const outGlb = path.join(root, 'public/demo/kiri-test.glb');
fs.copyFileSync(glbSrc, outGlb);
const bytes = fs.statSync(outGlb).size;
log(`GLB saved to public/demo/kiri-test.glb (${(bytes / 1e6).toFixed(1)}MB)`);

const balanceAfter = (await get('/balance', {})).balance;
log('balance after:', balanceAfter);

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'data/kiri-test.json'),
  JSON.stringify(
    { video: path.basename(videoPath), serialize, process_seconds: processSeconds,
      total_seconds: (Date.now() - t0) / 1000, glb_bytes: bytes, balance_after: balanceAfter },
    null,
    2
  )
);
fs.rmSync(tmpDir, { recursive: true, force: true });
log('done — details in data/kiri-test.json');
