import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { ApiError } from '@google/genai';
import { runPlanner, type PriorTurn } from '../agent/planner';
import type { Floorplan } from '../agent/floorplan';
import { describe, floorplanPath } from './scans';

const PLANS_DIR = path.join(__dirname, '..', '..', 'data', 'plans');
const LAST_PLAN = path.join(PLANS_DIR, 'last.json');

export const planRouter = Router();
planRouter.use(express.json({ limit: '2mb' }));

// POST /api/plan  { problem: string, scan?: string (default "demo"), history?: PriorTurn[] }
// Streams NDJSON: {type:"tool"|"thinking"|"text", ...} progress lines, then
// one {type:"result", plan} or {type:"error", message}.
planRouter.post('/plan', async (req, res) => {
  const problem = typeof req.body?.problem === 'string' ? req.body.problem.trim() : '';
  if (!problem) {
    res.status(400).json({ error: 'Expected JSON body { problem: string, floorplan?: object }' });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'Gemini API key missing — add GEMINI_API_KEY to server/.env and restart the server' });
    return;
  }
  const scanId = typeof req.body.scan === 'string' ? req.body.scan : 'demo';
  const file = floorplanPath(scanId);
  if (!file) {
    res.status(404).json({ error: `Unknown scan "${scanId}"` });
    return;
  }
  const floorplan: Floorplan = JSON.parse(fs.readFileSync(file, 'utf8'));

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (obj: unknown) => res.write(JSON.stringify(obj) + '\n');

  try {
    const history: PriorTurn[] = Array.isArray(req.body.history) ? req.body.history.slice(-4) : [];
    const plan = await runPlanner(problem, floorplan, send, history);
    if ('reply' in plan) {
      send({ type: 'reply', text: plan.reply, model: plan.model });
      return;
    }
    const record = { problem, scan: describe(scanId), floorplan, ...plan, created_at: new Date().toISOString() };
    fs.mkdirSync(PLANS_DIR, { recursive: true });
    fs.writeFileSync(LAST_PLAN, JSON.stringify(record, null, 2));
    send({ type: 'result', plan: record });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof ApiError && (err.status === 400 || err.status === 401 || err.status === 403)
        ? `Gemini rejected the request (${err.status}) — check GEMINI_API_KEY in server/.env`
        : err instanceof ApiError && err.status === 429
          ? 'Gemini free-tier limit reached on every model — wait a minute and try again'
          : err instanceof ApiError && err.status >= 500
            ? 'Every Gemini model is overloaded right now — try again in a minute'
          : err instanceof Error
            ? err.message
            : 'Planner failed';
    send({ type: 'error', message });
  } finally {
    res.end();
  }
});

// GET /api/plan/last — the most recent successful plan (demo fallback, no API call).
planRouter.get('/plan/last', (_req, res) => {
  if (!fs.existsSync(LAST_PLAN)) {
    res.status(404).json({ error: 'No plan generated yet' });
    return;
  }
  res.type('json').send(fs.readFileSync(LAST_PLAN, 'utf8'));
});
