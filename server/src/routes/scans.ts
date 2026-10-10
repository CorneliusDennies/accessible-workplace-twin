import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { Floorplan } from '../agent/floorplan';

// Scanned spaces = data/<id>-floorplan.json (+ a GLB in public/demo). The video
// → floor plan → GLB step is Claude, via scripts/video-to-room.ts.
const ROOT = path.join(__dirname, '..', '..', '..');
const SERVER = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const DEMO_GLBS = path.join(ROOT, 'public', 'demo');
const UPLOADS = path.join(SERVER, 'data', 'uploads');

const ID = /^[a-z0-9][a-z0-9-_]{0,60}$/;

export interface ScanInfo {
  id: string;
  name: string;
  glbUrl: string;
  room: { width: number; depth: number };
  rooms: string[];
  objects: number;
  source: string | null;
}

function glbFor(id: string): string | null {
  const candidates = id === 'demo' ? ['demo-office.glb'] : [`${id}.glb`, `${id}-clean.glb`];
  const hit = candidates.find((f) => fs.existsSync(path.join(DEMO_GLBS, f)));
  return hit ? `/demo/${hit}` : null;
}

export function floorplanPath(id: string): string | null {
  if (!ID.test(id)) return null;
  const file = path.join(DATA, `${id}-floorplan.json`);
  return fs.existsSync(file) ? file : null;
}

export function describe(id: string): ScanInfo | null {
  const file = floorplanPath(id);
  const glbUrl = glbFor(id);
  if (!file || !glbUrl) return null;
  const plan = JSON.parse(fs.readFileSync(file, 'utf8')) as Floorplan & { source?: string };
  const pretty = id === 'demo' ? 'Demo office' : id.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return {
    id,
    name: pretty,
    glbUrl,
    room: { width: plan.room.width, depth: plan.room.depth },
    rooms: (plan.rooms ?? []).map((r) => r.name),
    objects: plan.objects.length,
    source: plan.source ?? null,
  };
}

export function listScans(): ScanInfo[] {
  const ids = fs
    .readdirSync(DATA)
    .filter((f) => f.endsWith('-floorplan.json'))
    .map((f) => f.replace(/-floorplan\.json$/, ''));
  return ids
    .map(describe)
    .filter((s): s is ScanInfo => s !== null)
    .sort((a, b) => (a.id === 'demo' ? -1 : b.id === 'demo' ? 1 : a.name.localeCompare(b.name)));
}

export const scansRouter = Router();
const upload = multer({ dest: UPLOADS, limits: { fileSize: 500 * 1024 * 1024 } });

// GET /api/scans — every scanned space the planner can design for.
scansRouter.get('/scans', (_req, res) => {
  res.json({ scans: listScans() });
});

// POST /api/scans (multipart: video, optional name, optional hint)
// Streams NDJSON: {type:"log", text} lines from the Claude video→3D script, then
// {type:"result", scan} or {type:"error", message}.
scansRouter.post('/scans', upload.single('video'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video uploaded (expected field "video")' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    fs.rm(req.file.path, { force: true }, () => {});
    res.status(503).json({ error: 'Video → 3D uses Claude: add ANTHROPIC_API_KEY to server/.env and restart the server' });
    return;
  }

  const base = String(req.body?.name ?? path.parse(req.file.originalname).name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'scan';
  const id = `${base}-${Date.now().toString(36).slice(-4)}`;
  // ffmpeg/ffprobe sniff by extension, so keep the original one.
  const videoPath = `${req.file.path}${path.extname(req.file.originalname) || '.mp4'}`;
  fs.renameSync(req.file.path, videoPath);

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (obj: unknown) => res.write(JSON.stringify(obj) + '\n');
  send({ type: 'log', text: `Uploaded ${req.file.originalname} (${(req.file.size / 1e6).toFixed(1)} MB)` });

  const args = ['tsx', 'scripts/video-to-room.ts', videoPath, id];
  const hint = typeof req.body?.hint === 'string' ? req.body.hint.trim() : '';
  if (hint) args.push('--hint', hint);
  const child = spawn('npx', args, { cwd: SERVER, env: process.env });

  const lines = (chunk: Buffer) =>
    chunk
      .toString()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('◇'));
  let lastError = '';
  child.stdout.on('data', (c: Buffer) => lines(c).forEach((text) => send({ type: 'log', text })));
  child.stderr.on('data', (c: Buffer) =>
    lines(c).forEach((text) => {
      lastError = text;
      send({ type: 'log', text });
    }),
  );

  // Stop the (paid) Claude run if the user cancels the upload.
  res.on('close', () => {
    if (child.exitCode === null) child.kill();
  });

  child.on('close', (code) => {
    fs.rm(videoPath, { force: true }, () => {});
    const scan = code === 0 ? describe(id) : null;
    if (scan) send({ type: 'result', scan });
    else send({ type: 'error', message: lastError || `Video → 3D failed (exit ${code})` });
    res.end();
  });
});
