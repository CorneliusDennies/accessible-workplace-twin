// Run the planner agent from the terminal and print the three designs.
//
//   npx tsx scripts/plan.ts "Designing for Sarah, an engineer who uses a wheelchair."

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runPlanner } from '../src/agent/planner';

const problem = process.argv[2] ?? "We're designing for Sarah, a software engineer who uses a wheelchair.";
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'demo-floorplan.json'), 'utf8'));

runPlanner(problem, plan, (e) => {
  if (e.type === 'tool') console.log(`${e.ok ? '✓' : '✗'} ${e.name}: ${e.summary}`);
  else if (e.type === 'thinking') console.log(`  … ${e.text.split('\n')[0].slice(0, 140)}`);
}).then((result) => {
  if ('reply' in result) {
    console.log(`\nAgent asked: ${result.reply}`);
    return;
  }
  console.log(`\n${result.summary}\n`);
  for (const d of result.designs) {
    console.log(`Design ${d.id}: ${d.name} — ${d.tagline}  ($${d.report.total_cost})`);
    console.log(`  seat (${d.workstation.x}, ${d.workstation.z}), route from entrance ${d.report.workstation.metrics.route_from_entrance_m}m`);
    for (const p of d.report.placements) console.log(`  • ${p.product_name} at (${p.x}, ${p.z}) — ${p.reason}`);
    console.log(`  + ${d.pros.join('\n  + ')}\n  − ${d.cons.join('\n  − ')}\n  best for: ${d.best_for.join('; ')}\n`);
  }
  if (result.products) {
    console.log('Where to buy (cheapest first):');
    for (const [id, p] of Object.entries(result.products)) {
      const best = p.listings[0];
      console.log(`  ${id}: ${best ? `${best.price_text} at ${best.store} — ${best.title}` : 'no listings found'}`);
    }
  } else console.log('No SERPAPI_KEY — prices are estimates.');
  console.log(`tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);
}).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
