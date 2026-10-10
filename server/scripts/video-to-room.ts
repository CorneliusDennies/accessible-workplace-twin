// Video -> Claude vision -> floor plan JSON -> clean boxy 3D model (GLB), all rooms seen.
//
//   npx tsx scripts/video-to-room.ts <video> [name] [--hint "the door is 0.9m wide"] [--max-frames 60]
//                                    [--engine api|claude-code] [--from claude-code-passN.json] [--dry-run]
//
// Engine: the Claude API when ANTHROPIC_API_KEY is set, otherwise the local
// Claude Code CLI (headless, using its logged-in account — no API key needed).
//
// Takes one frame per second of video, capped at --max-frames (spread evenly
// across longer videos — a 60 s walkthrough is the intended maximum; beyond
// that a single room gets slower and pricier, not more accurate).
// Writes data/<name>-floorplan.json (same schema as data/demo-floorplan.json, so
// the planner agent can use it directly) and public/demo/<name>.glb.
// --dry-run extracts frames and stops before calling the API.

import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const MODEL = 'claude-opus-5-5';
const ROOT = path.join(__dirname, '..', '..');

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const dryRun = args.includes('--dry-run');
if (dryRun) args.splice(args.indexOf('--dry-run'), 1);
const hint = flag('--hint');
const engine = flag('--engine') as 'api' | 'claude-code' | undefined;
// Rebuild from a saved Claude Code answer (claude-code-pass1/2.json) instead of re-analysing the video.
const fromFile = flag('--from');
const maxFrames = Number(flag('--max-frames') ?? 60);
const [videoPath, name = 'video-room'] = args;
if (!videoPath) {
  console.error('Usage: npx tsx scripts/video-to-room.ts <video> [name] [--hint "..."] [--max-frames 60] [--engine api|claude-code] [--dry-run]');
  process.exit(1);
}

// Types the planner's floor plan code understands, plus window (rendered only).
const OBJECT_TYPES = [
  'door', 'window', 'desk', 'table', 'chair', 'sofa', 'bed', 'shelf', 'counter', 'cabinet', 'pillar', 'audio_alert', 'other',
] as const;

const FloorplanSchema = z.object({
  units: z.literal('meters'),
  room: z.object({
    width: z.number().describe('Room extent along x, meters'),
    depth: z.number().describe('Room extent along z, meters'),
    wall_height: z.number(),
  }),
  rooms: z.array(
    z.object({ id: z.string(), name: z.string(), x0: z.number(), z0: z.number(), x1: z.number(), z1: z.number() }),
  ).describe('Each room/area as a rectangle inside the outer boundary'),
  walls: z.array(
    z.object({ id: z.string(), x0: z.number(), z0: z.number(), x1: z.number(), z1: z.number() }),
  ).describe('Interior walls between rooms, axis-aligned segments. Leave out where areas are open to each other'),
  objects: z.array(
    z.object({
      id: z.string().describe('snake_case; the main way in must be "entrance"'),
      type: z.enum(OBJECT_TYPES),
      label: z.string().describe('What it actually is, e.g. "fridge", "TV stand", "smoke detector"'),
      x: z.number(),
      z: z.number(),
      w: z.number().optional().describe('Footprint along x (furniture)'),
      d: z.number().optional().describe('Footprint along z (furniture)'),
      width: z.number().optional().describe('Opening width (doors/windows)'),
      height: z.number().optional().describe('Top surface height, or mounting height for audio_alert'),
      top_height: z.number().optional().describe('Shelf top height'),
      sill: z.number().optional().describe('Window sill height; 0 for glass doors'),
    }),
  ),
  walkways: z.array(z.object({ from: z.string(), to: z.string(), min_width: z.number() })),
  notes: z.string().describe('What was uncertain or not visible'),
});
type Floorplan = z.infer<typeof FloorplanSchema>;

const SYSTEM = `You turn a phone walkthrough of a home or office into a floor plan that will be rebuilt as a simple 3D model and used for ADA accessibility checks.

Map every room or area the video shows: the outer boundary is one rectangle (room.width × room.depth), divided into rooms by interior walls. List each room as a rectangle, and each interior wall as an axis-aligned segment. Areas that are open to each other (e.g. living and dining) share no wall. A room only glimpsed through a doorway still gets its doorway, but skip its contents unless you can see them.

Coordinates are meters. x runs along the width (0..width), z along the depth (0..depth); the outer wall at z=0 is "north". Object x/z are footprint centres. Doors and windows sit exactly on a wall line: an outer wall (x or z equal to 0, width or depth) or an interior wall segment. Doors between rooms go on the interior wall between them; use type door for open archways too.

Work out how rooms connect from the order of the frames: what the camera turned or walked toward, and what was visible through each doorway.

Estimate sizes from things of known size: interior doors are about 0.8-0.9m wide and 2.0-2.1m tall, kitchen counters 0.9m high and 0.6m deep, dining tables 0.74m high, sofas 0.8-0.9m deep, beds 1.4-1.6m wide and 2.0m long, ceilings 2.4-2.7m. Use the user's measurement hint when given; it overrides your estimate.

Only include things you can see. Types: door, window (sill 0 for glass doors), desk, table, chair, sofa, bed, shelf (tall storage; set top_height), counter (also stoves, sinks), cabinet (low storage, and appliances like a fridge or washer; set height), pillar, audio_alert (smoke/fire alarms, doorbells, intercoms, speakers — anything that alerts by sound; set height to its mounting height), other. Chairs tucked at a table are implied — don't list them separately. Keep furniture inside its room and not overlapping walls or each other.

The main way in must have id "entrance". Add walkways from the entrance to each main destination (desks, tables, other rooms' doors) with min_width 0.9.

Use "notes" to say what you couldn't see or are unsure of, briefly.`;

function extractFrames(video: string, max: number): string[] {
  const duration = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString(),
  );
  // One frame per second, or fewer if that would exceed the cap.
  const count = Math.max(1, Math.min(Math.round(duration), max));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-frames-'));
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', video,
    '-vf', `fps=${count}/${duration},scale='min(1280,iw)':-2`,
    '-frames:v', String(count), '-q:v', '3',
    path.join(dir, 'f%02d.jpg'),
  ]);
  return fs.readdirSync(dir).sort().map((f) => path.join(dir, f));
}

const userPrompt = (count: number) =>
  `These ${count} frames are in order from one walkthrough video.${hint ? `\nMeasurement hint from the user: ${hint}` : ''}\nReturn the floor plan.`;

// Engine 1: the Claude API (needs ANTHROPIC_API_KEY). Works anywhere, incl. a deployed server.
async function planViaApi(frames: string[]): Promise<{ plan: Floorplan; model: string; usage: string }> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = frames.flatMap((f, i) => [
    { type: 'text' as const, text: `Frame ${i + 1} of ${frames.length}` },
    {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: fs.readFileSync(f).toString('base64') },
    },
  ]);
  content.push({ type: 'text', text: userPrompt(frames.length) });

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'high', format: betaZodOutputFormat(FloorplanSchema) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`The model declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ''}.`);
  }
  if (!response.parsed_output) throw new Error(`No floor plan returned (stop_reason: ${response.stop_reason})`);
  return {
    plan: response.parsed_output,
    model: response.model,
    usage: `tokens ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`,
  };
}

// Pull the first {...} JSON object out of a free-form answer (```json fences etc.).
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(`No JSON in Claude Code's answer: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

// Fill fields a free-form answer tends to leave out, so the strict schema check
// only fails on things that actually matter (missing rooms, positions, …).
function normalize(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const p = raw as Record<string, any>;
  return {
    ...p,
    units: 'meters',
    room: p.room && { wall_height: 2.6, ...p.room },
    // Rooms sometimes come as x/z + width/depth instead of corners.
    rooms: (p.rooms ?? []).map((r: Record<string, any>, i: number) => ({
      id: r.id ?? `room_${i + 1}`,
      name: r.name ?? r.id ?? `Room ${i + 1}`,
      ...('x0' in r ? r : { x0: r.x, z0: r.z, x1: r.x + r.width, z1: r.z + r.depth }),
    })),
    // Walls sometimes come as x1,z1 -> x2,z2 segments without ids.
    walls: (p.walls ?? []).map((w: Record<string, any>, i: number) =>
      'x2' in w ? { id: w.id ?? `wall_${i + 1}`, x0: w.x1, z0: w.z1, x1: w.x2, z1: w.z2 } : { id: w.id ?? `wall_${i + 1}`, ...w },
    ),
    // Furniture sometimes uses width/depth instead of w/d (doors/windows keep width).
    objects: (p.objects ?? []).filter((o: Record<string, any>) => typeof o.x === 'number' && typeof o.z === 'number').map((o: Record<string, any>, i: number) => {
      const opening = o.type === 'door' || o.type === 'window';
      return {
        label: o.label ?? o.notes ?? o.type,
        ...o,
        id: o.id ?? `${o.type ?? 'object'}_${i + 1}`,
        ...(!opening && o.w === undefined && o.width !== undefined ? { w: o.width, width: undefined } : {}),
        ...(!opening && o.d === undefined && o.depth !== undefined ? { d: o.depth } : {}),
      };
    }),
    // Walkways are optional hints; drop ones that aren't from/to pairs (e.g. point lists).
    walkways: (p.walkways ?? []).filter((w: Record<string, any>) => typeof w.from === 'string' && typeof w.to === 'string'),
    notes: p.notes ?? '',
  };
}

// Engine 2: the local Claude Code CLI in headless mode, using whatever account
// Claude Code is logged in with (e.g. a Claude Pro subscription) — no API key.
// Only works on a machine where `claude` is installed and logged in.
function runClaudeCode(prompt: string, extraArgs: string[], cwd: string, debugFile: string) {
  const out = execFileSync(
    'claude',
    ['-p', prompt, '--model', 'opus', '--output-format', 'json', '--no-session-persistence', ...extraArgs],
    { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 },
  ).toString();
  fs.writeFileSync(debugFile, out); // raw answer, for debugging
  const result = JSON.parse(out);
  if (result.is_error) throw new Error(`Claude Code failed: ${result.result ?? out.slice(0, 300)}`);
  return result as { result?: string; structured_output?: unknown; total_cost_usd?: number; num_turns?: number };
}

function planViaClaudeCode(frames: string[]): { plan: Floorplan; model: string; usage: string } {
  const framesDir = path.dirname(frames[0]);
  const schema = JSON.stringify(z.toJSONSchema(FloorplanSchema));

  // Pass 1: read the frames (one Read tool call each) and work out the layout.
  // Claude Code doesn't reliably apply --json-schema after many tool turns, so
  // this pass may answer in free-form text…
  const look = fromFile ? JSON.parse(fs.readFileSync(fromFile, 'utf8')) : runClaudeCode(
    [
      'Read each of these image files with the Read tool, in this order:',
      ...frames.map((f, i) => `Frame ${i + 1}: ${f}`),
      '',
      userPrompt(frames.length),
      'Answer with the floor plan as JSON matching the schema.',
    ].join('\n'),
    ['--append-system-prompt', SYSTEM, '--json-schema', schema, '--allowedTools', 'Read', '--add-dir', framesDir],
    framesDir,
    path.join(framesDir, 'claude-code-pass1.json'),
  );
  let cost = fromFile ? 0 : (look.total_cost_usd ?? 0);
  let raw = look.structured_output;
  if (!FloorplanSchema.safeParse(raw).success && look.result) {
    try {
      raw = normalize(extractJson(look.result));
    } catch {
      // fall through to the conversion pass
    }
  }

  // …so pass 2 (text only, one turn, cheap) converts that answer into the exact schema.
  if (!FloorplanSchema.safeParse(raw).success) {
    console.log('  converting the layout into the floor plan format…');
    const convert = runClaudeCode(
      `Convert this floor plan description into the required JSON schema. Keep every room, wall, door, window and object and their positions; rename fields and convert units/representation as needed (e.g. a room given as x/z/width/depth becomes x0=x, z0=z, x1=x+width, z1=z+depth; objects nested in rooms move to the top-level objects list in absolute coordinates). Follow the coordinate rules in the system prompt.\n\n${look.result ?? ''}`,
      // No tool restrictions here: Claude Code delivers --json-schema output through
      // an internal tool, so `--tools ""` silently turns structured output off.
      ['--append-system-prompt', SYSTEM, '--json-schema', schema],
      framesDir,
      path.join(framesDir, 'claude-code-pass2.json'),
    );
    cost += convert.total_cost_usd ?? 0;
    raw = convert.structured_output ?? normalize(extractJson(convert.result ?? ''));
  }

  console.log(`  raw Claude Code output in ${framesDir}`);
  return {
    plan: FloorplanSchema.parse(raw),
    model: 'Claude Code (opus)',
    usage: `API-equivalent cost $${cost.toFixed(2)} (billed to the Claude Code login's plan, not an API key)`,
  };
}

async function main() {
  const frames = fromFile ? [path.join(path.dirname(fromFile), 'f01.jpg')] : extractFrames(videoPath, maxFrames);
  const kb = frames.reduce((s, f) => s + fs.statSync(f).size, 0) / 1024;
  console.log(`Extracted ${frames.length} frames (${kb.toFixed(0)} KB) from ${path.basename(videoPath)}`);
  if (dryRun) {
    console.log(`Dry run — frames in ${path.dirname(frames[0])}`);
    return;
  }

  const useApi = !fromFile && (engine === 'api' || (engine === undefined && !!process.env.ANTHROPIC_API_KEY));
  console.log(`Analysing with ${useApi ? 'the Claude API' : 'Claude Code (local login, no API key)'}…`);
  const t0 = Date.now();
  const { plan, model, usage } = useApi ? await planViaApi(frames) : planViaClaudeCode(frames);

  const outJson = path.join(ROOT, 'data', `${name}-floorplan.json`);
  fs.writeFileSync(outJson, JSON.stringify({ ...plan, source: `${model} from ${frames.length} frames of ${path.basename(videoPath)}` }, null, 2));
  console.log(`Floor plan: ${plan.room.width} × ${plan.room.depth} m, ${plan.rooms.length} rooms (${plan.rooms.map((r) => r.name).join(', ')}), ${plan.objects.length} objects -> ${path.relative(ROOT, outJson)}`);
  console.log(`  ${plan.objects.map((o) => `${o.id} (${o.label})`).join(', ')}`);
  console.log(`  notes: ${plan.notes}`);

  const outGlb = path.join(ROOT, 'public', 'demo', `${name}.glb`);
  execFileSync('node', [path.join(ROOT, 'scripts', 'floorplan-to-glb.mjs'), outJson, outGlb], { stdio: 'inherit' });

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s${usage ? ` · ${usage}` : ''}`);
  console.log(`View: http://localhost:5173/?planner&glb=/demo/${name}.glb`);
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('Claude API key missing or invalid — set ANTHROPIC_API_KEY in server/.env, or run with --engine claude-code');
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
