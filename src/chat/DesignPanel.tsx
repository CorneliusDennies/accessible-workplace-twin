import type { CSSProperties } from 'react';
import { DESIGN_COLORS } from '../planner/agent/colors';
import type { Design, PlanResult } from '../planner/agent/types';
import { IconClose } from './icons';
import { RoomViewer } from './RoomViewer';
import { DEMO_SPACE } from './spaces';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

interface DesignPanelProps {
  plan: PlanResult;
  designId: Design['id'];
  onSelect: (id: Design['id']) => void;
  onClose: () => void;
}

export function DesignPanel({ plan, designId, onSelect, onClose }: DesignPanelProps) {
  const design = plan.designs.find((d) => d.id === designId) ?? plan.designs[0];
  const m = design.report.workstation.metrics;
  const walks = Object.entries(m.walk_to_m).filter(([k, v]) => k !== 'entrance' && v !== null);

  return (
    <aside className="panel" aria-label="Design details" style={{ '--dc': DESIGN_COLORS[design.id] } as CSSProperties}>
      <header className="panel-head">
        <div className="panel-tabs" role="tablist">
          {plan.designs.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={d.id === design.id}
              className={d.id === design.id ? 'on' : ''}
              onClick={() => onSelect(d.id)}
              style={{ '--tc': DESIGN_COLORS[d.id] } as CSSProperties}
            >
              Design {d.id}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <IconClose size={18} />
        </button>
      </header>

      <RoomViewer glbUrl={plan.scan?.glbUrl ?? DEMO_SPACE.glbUrl} room={plan.scan?.room ?? DEMO_SPACE.room} design={design} />

      <div className="panel-body" key={design.id}>
        <h2>{design.name}</h2>
        <p className="panel-tagline">{design.tagline}</p>

        <div className="stats">
          <div>
            <span>Estimated cost</span>
            <strong>{usd(design.report.total_cost)}</strong>
          </div>
          <div>
            <span>Route from entrance</span>
            <strong>{m.route_from_entrance_m ?? '—'} m</strong>
          </div>
          <div>
            <span>60in turning space</span>
            <strong>{m.turning_space ? 'Yes' : 'No'}</strong>
          </div>
        </div>

        <h4>Products and placement</h4>
        <ol className="products">
          {design.report.placements.map((p, i) => (
            <li key={i}>
              <span className="design-badge">{i + 1}</span>
              <div>
                <div className="product-name">
                  {p.product_name}
                  <span>{usd(p.unit_cost)}</span>
                </div>
                <p>{p.reason}</p>
                {plan.products?.[p.product_id]?.listings[0] && (
                  <a className="panel-buy" href={plan.products[p.product_id].listings[0].link} target="_blank" rel="noreferrer">
                    Cheapest: <strong>{plan.products[p.product_id].listings[0].price_text}</strong> at {plan.products[p.product_id].listings[0].store} →
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="proscons">
          <div>
            <h4>Pros</h4>
            <ul className="pros">
              {design.pros.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
          <div>
            <h4>Cons</h4>
            <ul className="cons">
              {design.cons.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        </div>

        <h4>Best for</h4>
        <ul className="bestfor">
          {design.best_for.map((t, i) => <li key={i}>{t}</li>)}
        </ul>

        {walks.length > 0 && (
          <>
            <h4>Walking distance from the seat</h4>
            <div className="walks">
              {walks.map(([k, v]) => (
                <span key={k}>
                  {k.replace(/_/g, ' ')} <strong>{v} m</strong>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
