import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type GenerateContentResponse, type Part, type ThinkingConfig } from '@google/genai';
import { z } from 'zod';
import { auditLayout } from './audit';
import { pricedCatalog } from './catalog';
import { loadListings, type ProductListings } from './shopping';
import type { Floorplan } from './floorplan';
import { buildTools, type AgentEvent, type AgentTool, type Submission } from './tools';

export const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
// Free-tier models get overloaded (503) or rate-limited (429); fall through these in order.
// (Gemini 2.x is retired for new API keys, so the chain stays on 3.x.)
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'];
const BUSY = new Set([429, 500, 503, 504]);
const MAX_TURNS = 24;

// Low thinking per step keeps each round fast; the tools carry the hard reasoning.
// Gemini 2.x takes a token budget instead of a level.
function thinkingFor(model: string): ThinkingConfig {
  return /gemini-2\./.test(model)
    ? { includeThoughts: true, thinkingBudget: 1024 }
    : { includeThoughts: true, thinkingLevel: ThinkingLevel.LOW };
}

const SYSTEM = `You are an accessibility planner for office renovations. A facilities team has scanned their office and described the employee they are designing for. Your job is to propose three distinct, buildable renovation designs for that person, before construction starts.

Each design picks where the employee sits and places two or three assistive products from the catalog at the most effective spots in the room. The three designs should be genuinely different trade-offs (for example: shortest route vs. closest to the team vs. lowest cost), not variations of one idea.

You have deterministic tools for the facts: an ADA audit, the product catalog, a workstation evaluator, and a design checker that proves routes, clearances, and mounting. Rely on them rather than estimating geometry yourself, and only cite standards the tools report. Every design must pass check_design before you call submit_designs; if submit_designs returns errors, fix them and submit again. Work in as few rounds as possible: the audit and catalog are already in the request, so go straight to evaluating candidate seats (several in parallel), then check all three drafts in parallel in one round, then submit. Write pros, cons, and best-fit scenarios in plain language a facilities manager would use, grounded in the tool results (distances, costs, issues fixed).

Only design when you know who the space is for and what they need (for example "Sarah, uses a wheelchair", "a Deaf designer", "someone with low vision"); earlier turns of the conversation count. If the message is a greeting, small talk, or doesn't say who or what need, do not call any tools and do not guess: reply in one or two friendly sentences asking who they're designing for and what they need, and mention you can also scan their own space from a walkthrough video (the paperclip button). Never invent a person or a disability.

Coordinates are meters: x runs 0..room.width, z runs 0..room.depth, object x/z are footprint centers.`;

/** The agent answered in words instead of designing (e.g. it needs to know who the space is for). */
export interface ReplyResult {
  reply: string;
  model: string;
}

export interface PlanResult extends Submission {
  model: string;
  // Real listings (cheapest first) for every product used in the designs; null when no shopping API is set up.
  products: Record<string, ProductListings> | null;
  usage: { input_tokens: number; output_tokens: number };
}

export interface PriorTurn {
  request: string;
  summary: string;
  designs: { id: string; name: string; tagline: string; total_cost: number; products: string[] }[];
}

// Earlier turns of the chat, so follow-ups like "make B cheaper" have context.
function formatHistory(history: PriorTurn[]): string {
  if (!history.length) return '';
  const turns = history.map((t, i) => {
    const designs = t.designs
      .map((d) => `  Design ${d.id} "${d.name}" ($${d.total_cost}): ${d.tagline}. Products: ${d.products.join(', ')}`)
      .join('\n');
    return `Request ${i + 1}: ${t.request}\nYour answer: ${t.summary}${designs ? `\n${designs}` : ''}`;
  });
  return `Earlier in this conversation:\n${turns.join('\n\n')}\n\nThe new message may answer your question or refine earlier designs. If you design, return three complete designs.\n\n`;
}

// Zod → JSON Schema, minus the keys Gemini's schema subset doesn't need.
function toDeclaration(t: AgentTool): FunctionDeclaration {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === '$schema' || k === 'additionalProperties') continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return { name: t.name, description: t.description, parametersJsonSchema: strip(z.toJSONSchema(t.schema)) };
}

export class MissingKeyError extends Error {}

export async function runPlanner(
  problem: string,
  plan: Floorplan,
  emit: (e: AgentEvent) => void = () => {},
  history: PriorTurn[] = [],
): Promise<PlanResult | ReplyResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new MissingKeyError('Gemini API key missing — add GEMINI_API_KEY to server/.env and restart the server');

  // Fail fast on an overloaded or rate-limited model and switch, instead of the SDK's default 5 slow retries.
  // Real prices first, so the agent's costs and trade-offs use them (cached; ~free after the first run).
  const listings = await loadListings(undefined, (text) => emit({ type: 'text', text })).catch((err) => {
    console.error('Product search failed:', err);
    return null;
  });
  const productsForPrompt = pricedCatalog().map(({ search: _search, ...p }) => p);

  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } } });
  const models = [MODEL, ...FALLBACK_MODELS.filter((m) => m !== MODEL)];
  let modelIndex = 0;
  let usedTools = false;
  let submission: Submission | null = null;
  const tools = buildTools(plan, emit, (s) => {
    submission = s;
  });
  const byName = new Map(tools.map((t) => [t.name, t]));

  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        {
          text: [
            `${formatHistory(history)}Request:\n${problem}`,
            `Office layout (from the scan):\n${JSON.stringify(plan)}`,
            // Precomputed so the agent can skip two tool round trips; the tools still exist for re-checks.
            `ADA audit for every need (filter to the ones that apply):\n${JSON.stringify(auditLayout(plan, ['wheelchair', 'blind', 'low_vision', 'deaf', 'hard_of_hearing']))}`,
            `Product catalog (unitCost is the cheapest real US listing when price_source is "live", otherwise an estimate):\n${JSON.stringify(productsForPrompt)}`,
          ].join('\n\n'),
        },
      ],
    },
  ];
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (let turn = 0; turn < MAX_TURNS && !submission; turn++) {
    let response: GenerateContentResponse | null = null;
    while (!response) {
      try {
        response = await ai.models.generateContent({
          model: models[modelIndex],
          contents,
          config: {
            systemInstruction: SYSTEM,
            tools: [{ functionDeclarations: tools.map(toDeclaration) }],
            thinkingConfig: thinkingFor(models[modelIndex]),
          },
        });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        const next = models[modelIndex + 1];
        // Busy, out of free-tier quota (each model has its own), or not available to this key: move down the chain.
        if (!(BUSY.has(err.status) || err.status === 404) || !next) throw err;
        emit({ type: 'text', text: `${models[modelIndex]} unavailable (${err.status}), switching to ${next}` });
        modelIndex++;
      }
    }
    usage.input_tokens += response.usageMetadata?.promptTokenCount ?? 0;
    usage.output_tokens += (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0);

    const content = response.candidates?.[0]?.content;
    if (!content?.parts?.length) {
      const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason ?? 'empty response';
      throw new Error(`Gemini returned no content (${reason}).`);
    }
    // Send the model's turn back unchanged so its thought signatures carry over.
    contents.push(content);

    for (const part of content.parts) {
      if (part.text?.trim() && part.thought) emit({ type: 'thinking', text: part.text });
    }

    const calls = response.functionCalls ?? [];
    if (!calls.length) {
      const reply = content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim();
      // Answered in words before using any tools: it's a question back to the user, not a design.
      if (!usedTools && reply) return { reply, model: models[modelIndex] };
      // Mid-design prose without submitting: nudge it to finish with the tool.
      contents.push({ role: 'user', parts: [{ text: 'Finish by calling submit_designs with the three validated designs.' }] });
      continue;
    }
    usedTools = true;

    const results: Part[] = [];
    for (const call of calls) {
      const t = call.name ? byName.get(call.name) : undefined;
      const output = t ? await t.run(call.args ?? {}) : { error: `Unknown tool "${call.name}".` };
      results.push({ functionResponse: { id: call.id, name: call.name, response: { output } } });
    }
    contents.push({ role: 'user', parts: results });
  }

  if (!submission) throw new Error('The agent stopped without submitting three valid designs. Try rephrasing the request.');
  const done = submission as Submission;
  const used = new Set(done.designs.flatMap((d) => d.report.placements.map((p) => p.product_id)));
  const products = listings ? Object.fromEntries(Object.entries(listings).filter(([id]) => used.has(id))) : null;
  return { ...done, model: models[modelIndex], usage, products };
}
