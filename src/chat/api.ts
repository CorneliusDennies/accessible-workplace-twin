import { SCAN_API_BASE_URL } from '../config';
import type { AgentEvent, PlanResult } from '../planner/agent/types';

export interface ScanInfo {
  id: string;
  name: string;
  glbUrl: string;
  room: { width: number; depth: number };
  rooms: string[];
  objects: number;
  source: string | null;
}

export interface PriorTurn {
  request: string;
  summary: string;
  designs: { id: string; name: string; tagline: string; total_cost: number; products: string[] }[];
}

interface StreamHandlers {
  onEvent: (e: AgentEvent) => void;
  onResult: (plan: PlanResult) => void;
  onReply: (text: string) => void; // the agent asked a question instead of designing
}

export function replyTurn(request: string, reply: string): PriorTurn {
  return { request, summary: reply, designs: [] };
}

export function toPriorTurn(request: string, plan: PlanResult): PriorTurn {
  return {
    request,
    summary: plan.summary,
    designs: plan.designs.map((d) => ({
      id: d.id,
      name: d.name,
      tagline: d.tagline,
      total_cost: d.report.total_cost,
      products: d.report.placements.map((p) => p.product_name),
    })),
  };
}

/** POST /api/plan and read the NDJSON progress stream until a result or error arrives. */
export async function streamPlan(
  problem: string,
  scanId: string,
  history: PriorTurn[],
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${SCAN_API_BASE_URL}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem, scan: scanId, history }),
    signal,
  });
  await readNdjson(res, (msg) => {
    if (msg.type === 'result') {
      handlers.onResult(msg.plan as PlanResult);
      return true;
    }
    if (msg.type === 'reply') {
      handlers.onReply(String(msg.text));
      return true;
    }
    handlers.onEvent(msg as AgentEvent);
    return false;
  });
}

export async function listScans(): Promise<ScanInfo[]> {
  const res = await fetch(`${SCAN_API_BASE_URL}/api/scans`);
  if (!res.ok) throw new Error('Could not load scanned spaces.');
  return (await res.json()).scans;
}

/** Upload a walkthrough video; the server turns it into a floor plan + 3D model with Claude. */
export async function uploadScan(file: File, onLog: (text: string) => void, signal: AbortSignal): Promise<ScanInfo> {
  const form = new FormData();
  form.append('video', file);
  const res = await fetch(`${SCAN_API_BASE_URL}/api/scans`, { method: 'POST', body: form, signal });
  let scan: ScanInfo | null = null;
  await readNdjson(res, (msg) => {
    if (msg.type === 'result') {
      scan = msg.scan as ScanInfo;
      return true;
    }
    if (msg.type === 'log') onLog(String(msg.text));
    return false;
  });
  return scan!;
}

/**
 * Read an NDJSON response. `onMessage` returns true once it got the final
 * result; {type:"error"} lines throw. Throws if the stream ends without a result.
 */
async function readNdjson(res: Response, onMessage: (msg: { type: string; [k: string]: unknown }) => boolean): Promise<void> {
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `The server returned ${res.status}.`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === 'error') throw new Error(msg.message);
      if (onMessage(msg)) return;
    }
  }
  throw new Error('The server stopped before finishing.');
}

export async function fetchLastPlan(): Promise<PlanResult> {
  const res = await fetch(`${SCAN_API_BASE_URL}/api/plan/last`);
  if (!res.ok) throw new Error('No saved result yet. Generate one first.');
  return res.json();
}
