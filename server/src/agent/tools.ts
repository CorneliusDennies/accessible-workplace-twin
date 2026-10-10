import { z } from 'zod';
import { auditLayout } from './audit';
import { pricedCatalog, type Need } from './catalog';
import type { Floorplan } from './floorplan';
import { evaluateDesign, evaluateWorkstation, type DesignInput, type DesignReport, type PlacementInput } from './placement';

const NeedSchema = z.enum(['wheelchair', 'blind', 'low_vision', 'deaf', 'hard_of_hearing']);

// Kept to plain types (no unions/nulls) so every model provider's schema subset accepts it.
const PlacementSchema = z.object({
  product_id: z.string(),
  x: z.number().describe('meters, room x (0..width)'),
  z: z.number().describe('meters, room z (0..depth)'),
  rotation_deg: z.number().describe('0 or 90'),
  target_object_id: z
    .string()
    .describe('desk/table id for desk items, door id for door items, the replaced object id for replacements, otherwise ""'),
  reason: z.string().describe('one sentence: why this product, why here'),
});

const DraftSchema = z.object({
  workstation: z.object({ x: z.number(), z: z.number() }).describe('where the employee sits, beside their desk'),
  placements: z.array(PlacementSchema),
});

const DesignSchema = DraftSchema.extend({
  name: z.string().describe('short, e.g. "Entrance-side workstation"'),
  tagline: z.string().describe('one line on what this design optimizes'),
  pros: z.array(z.string()).describe('2–4 items'),
  cons: z.array(z.string()).describe('1–3 items'),
  best_for: z.array(z.string()).describe('1–3 scenarios this design fits best'),
});

type RawPlacement = z.infer<typeof PlacementSchema>;

const toPlacement = (p: RawPlacement): PlacementInput => ({
  ...p,
  rotation_deg: Math.round(p.rotation_deg / 90) % 2 ? 90 : 0,
  target_object_id: p.target_object_id.trim() || null,
});

export interface SubmittedDesign extends DesignInput {
  id: 'A' | 'B' | 'C';
  report: DesignReport;
}

export interface Submission {
  needs: Need[];
  summary: string;
  designs: SubmittedDesign[];
}

export type AgentEvent =
  | { type: 'tool'; name: string; summary: string; ok: boolean }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string };

/** Provider-neutral tool: the planner adapts these to the model's function-calling format. */
export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodObject;
  run: (input: unknown) => Promise<unknown>;
}

function tool<S extends z.ZodObject>(name: string, description: string, schema: S, run: (input: z.infer<S>) => Promise<unknown>): AgentTool {
  return {
    name,
    description,
    schema,
    run: async (input) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { error: `Invalid arguments: ${z.prettifyError(parsed.error)}` };
      return run(parsed.data);
    },
  };
}

export function buildTools(plan: Floorplan, emit: (e: AgentEvent) => void, onSubmit: (s: Submission) => void): AgentTool[] {
  const audit = tool(
    'audit_accessibility',
    'Run a deterministic ADA-based accessibility audit of the office for the given needs. Returns issues with object ids, positions, severity, and the standard cited.',
    z.object({ needs: z.array(NeedSchema) }),
    async ({ needs }) => {
      const issues = auditLayout(plan, needs);
      emit({ type: 'tool', name: 'audit_accessibility', ok: true, summary: `Audited for ${needs.join(', ')}: ${issues.length} issues` });
      return { issues };
    },
  );

  const search = tool(
    'search_products',
    'List assistive products from the catalog that serve any of the given needs, with mount type, footprint, cost, placement guidance, and standards.',
    z.object({ needs: z.array(NeedSchema) }),
    async ({ needs }) => {
      const products = pricedCatalog()
        .filter((p) => p.serves.some((s) => needs.includes(s)))
        .map(({ search: _search, ...p }) => p);
      emit({ type: 'tool', name: 'search_products', ok: true, summary: `Found ${products.length} products for ${needs.join(', ')}` });
      return { products };
    },
  );

  const workstation = tool(
    'evaluate_workstation',
    'Score a candidate seat position on the current layout (no new products): whether a 36in route reaches it from the entrance, whether a 60in turning circle fits, the nearest desk, and walking distances to shared spaces.',
    z.object({ x: z.number(), z: z.number(), needs: z.array(NeedSchema) }),
    async ({ x, z: zz, needs }) => {
      const report = evaluateWorkstation(plan, { x, z: zz }, [], needs);
      emit({
        type: 'tool',
        name: 'evaluate_workstation',
        ok: report.ok,
        summary: `Seat (${x}, ${zz}): ${report.ok ? 'reachable' : report.errors[0]}`,
      });
      const { route_path: _path, ...metrics } = report.metrics;
      return { ...report, metrics };
    },
  );

  const check = tool(
    'check_design',
    'Validate a draft design (workstation + 2–3 product placements) against the geometry: collisions, room bounds, door clearance, 36in routes to every piece of furniture, turning space at the seat, and mounting rules. Returns errors to fix and total cost. Use this before submitting.',
    DraftSchema.extend({ needs: z.array(NeedSchema) }),
    async ({ needs, workstation: ws, placements }) => {
      const draft: DesignInput = { workstation: ws, placements: placements.map(toPlacement), name: '', tagline: '', pros: [], cons: [], best_for: [] };
      const report = evaluateDesign(plan, draft, needs);
      emit({
        type: 'tool',
        name: 'check_design',
        ok: report.ok,
        summary: report.ok
          ? `Draft with ${placements.map((p) => p.product_id).join(', ')} passes ($${report.total_cost})`
          : `Draft has ${report.errors.length} problem${report.errors.length > 1 ? 's' : ''}: ${report.errors[0]}`,
      });
      const { route_path: _path, ...metrics } = report.workstation.metrics;
      return { ok: report.ok, errors: report.errors, total_cost: report.total_cost, workstation: metrics };
    },
  );

  const submit = tool(
    'submit_designs',
    'Submit the final three designs. Each is re-validated; if any fail, the errors come back and nothing is accepted. Call this once all three pass check_design.',
    z.object({
      needs: z.array(NeedSchema),
      summary: z.string().describe('two sentences: who this is for and what drove the three options'),
      designs: z.array(DesignSchema).describe('exactly 3 designs'),
    }),
    async ({ needs, summary, designs }) => {
      if (designs.length !== 3) return { accepted: false, errors: [`Submit exactly 3 designs; got ${designs.length}.`] };
      const ids = ['A', 'B', 'C'] as const;
      const results: SubmittedDesign[] = designs.map((d, i) => {
        const design: DesignInput = { ...d, placements: d.placements.map(toPlacement) };
        return { ...design, id: ids[i], report: evaluateDesign(plan, design, needs) };
      });
      const errors = results.flatMap((r) => r.report.errors.map((e) => `Design ${r.id} (${r.name}): ${e}`));

      const signature = (d: DesignInput) =>
        `${d.workstation.x.toFixed(1)},${d.workstation.z.toFixed(1)}|${d.placements.map((p) => p.product_id).sort().join(',')}`;
      if (new Set(results.map(signature)).size < 3) errors.push('Two designs are identical; make the three options meaningfully different.');

      emit({
        type: 'tool',
        name: 'submit_designs',
        ok: errors.length === 0,
        summary: errors.length ? `Rejected: ${errors[0]}` : `Accepted designs ${designs.map((d) => d.name).join(' · ')}`,
      });
      if (errors.length) return { accepted: false, errors };
      onSubmit({ needs, summary, designs: results });
      return { accepted: true };
    },
  );

  return [audit, search, workstation, check, submit];
}
