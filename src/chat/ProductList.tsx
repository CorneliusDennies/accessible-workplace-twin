import { useState } from 'react';
import type { Listing, PlanResult } from '../planner/agent/types';
import { DESIGN_COLORS } from '../planner/agent/colors';
import { IconChevron, IconTag } from './icons';

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function ListingRow({ l, best }: { l: Listing; best?: boolean }) {
  return (
    <a className={`listing ${best ? 'best' : ''}`} href={l.link} target="_blank" rel="noreferrer">
      {l.thumbnail ? <img src={l.thumbnail} alt="" loading="lazy" /> : <span className="listing-img" />}
      <span className="listing-main">
        <span className="listing-title">{l.title}</span>
        <span className="listing-meta">
          {l.store}
          {l.rating ? ` · ★ ${l.rating}${l.reviews ? ` (${l.reviews.toLocaleString('en-US')})` : ''}` : ''}
          {l.delivery ? ` · ${l.delivery}` : ''}
        </span>
      </span>
      <span className="listing-price">
        {best && <em>Cheapest</em>}
        {l.price_text}
      </span>
    </a>
  );
}

function ProductRow({ name, estimate, designs, listings }: { name: string; estimate: number; designs: string[]; listings: Listing[] }) {
  const [open, setOpen] = useState(false);
  const [best, ...rest] = listings;
  return (
    <li className="product-row">
      <div className="product-row-head">
        <div>
          <strong>{name}</strong>
          <span className="product-row-designs">
            Used in{' '}
            {designs.map((d) => (
              <i key={d} style={{ background: DESIGN_COLORS[d as 'A' | 'B' | 'C'] }}>
                {d}
              </i>
            ))}
          </span>
        </div>
        {!best && <span className="product-row-est">~{usd(estimate)} est.</span>}
      </div>
      {best ? (
        <>
          <ListingRow l={best} best />
          {rest.length > 0 && (
            <>
              <button className="more-stores" onClick={() => setOpen((o) => !o)}>
                <IconChevron size={13} className={open ? 'open' : ''} /> {open ? 'Hide' : `${rest.length} more option${rest.length > 1 ? 's' : ''}`}
                {!open && ` from ${usd(rest[0].price)}`}
              </button>
              {open && rest.map((l, i) => <ListingRow key={i} l={l} />)}
            </>
          )}
        </>
      ) : (
        <p className="product-row-none">No matching listings found — price shown is an estimate.</p>
      )}
    </li>
  );
}

/** Every product the three designs use, with real store listings sorted cheapest first. */
export function ProductList({ plan }: { plan: PlanResult }) {
  // Unique products across designs, remembering which designs use each.
  const used = new Map<string, { name: string; estimate: number; designs: string[] }>();
  for (const d of plan.designs) {
    for (const p of d.report.placements) {
      const entry = used.get(p.product_id) ?? { name: p.product_name, estimate: p.unit_cost, designs: [] };
      if (!entry.designs.includes(d.id)) entry.designs.push(d.id);
      used.set(p.product_id, entry);
    }
  }
  const fetched = plan.products ? Object.values(plan.products)[0]?.fetched_at : null;

  return (
    <section className="product-list">
      <header>
        <IconTag size={15} />
        <strong>Products used · where to buy</strong>
        <span>
          {plan.products
            ? `Live Google Shopping prices${fetched ? `, checked ${new Date(fetched).toLocaleDateString()}` : ''}`
            : 'Estimated prices — add SERPAPI_KEY for real listings'}
        </span>
      </header>
      <ul>
        {[...used].map(([id, u]) => (
          <ProductRow key={id} name={u.name} estimate={u.estimate} designs={u.designs} listings={plan.products?.[id]?.listings ?? []} />
        ))}
      </ul>
    </section>
  );
}
