import { useEffect, useState, type CSSProperties } from 'react';
import { DESIGN_COLORS } from '../planner/agent/colors';
import type { AgentEvent, Design } from '../planner/agent/types';
import type { ScanInfo } from './api';
import { ProductList } from './ProductList';
import { IconAlert, IconBuilding, IconCheck, IconChevron, IconCube, IconRoute, IconTag } from './icons';
import type { Turn } from './types';

const TOOL_LABELS: Record<string, string> = {
  audit_accessibility: 'Audited the office',
  search_products: 'Searched the product catalog',
  evaluate_workstation: 'Checked a seat position',
  check_design: 'Validated a design draft',
  submit_designs: 'Submitted designs',
};

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

function useElapsed(start: number, end?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);
  return Math.max(0, Math.round(((end ?? now) - start) / 1000));
}

function lastThought(events: AgentEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'thinking' || e.type === 'text') return e.text.split('\n').find((l) => l.trim()) ?? null;
    if (e.type === 'tool') return TOOL_LABELS[e.name] ?? e.name;
  }
  return null;
}

function WorkingSteps({ turn }: { turn: Turn }) {
  const running = turn.status === 'running';
  const [open, setOpen] = useState(false);
  const seconds = useElapsed(turn.startedAt, turn.finishedAt);
  const tools = turn.events.filter((e) => e.type === 'tool');
  const visible = open || running;

  const failed = turn.status === 'error';
  const isScan = turn.kind === 'scan';
  const headline = running
    ? lastThought(turn.events) ?? (isScan ? 'Uploading your video' : 'Reading the office layout')
    : isScan
      ? `${failed ? 'Stopped after' : 'Built your 3D space in'} ${seconds}s`
      : `${failed ? 'Stopped after' : 'Worked for'} ${seconds}s · ${tools.length} checks`;

  return (
    <div className={`steps ${running ? 'is-running' : ''}`}>
      <button className="steps-head" onClick={() => setOpen((o) => !o)} disabled={running}>
        {running ? (
          <span className="steps-pulse" />
        ) : failed ? (
          <IconAlert size={15} className="steps-failed" />
        ) : (
          <IconCheck size={15} className="steps-done" />
        )}
        <span className={running ? 'shimmer' : ''}>{headline}</span>
        {running && <span className="steps-time">{seconds}s</span>}
        {!running && <IconChevron size={14} className={`steps-chev ${open ? 'open' : ''}`} />}
      </button>
      {visible && turn.events.length > 0 && (
        <ol className="steps-list">
          {turn.events.map((e, i) =>
            e.type === 'tool' ? (
              <li key={i} className={e.ok ? 'ok' : 'retry'}>
                <span className="steps-dot" />
                <div>
                  <strong>{TOOL_LABELS[e.name] ?? e.name}</strong>
                  <span>{e.summary}</span>
                </div>
              </li>
            ) : (
              <li key={i} className="thought">
                <span className="steps-dot" />
                <div>
                  <span>{e.text.split('\n').filter((l) => l.trim()).slice(0, 2).join(' ')}</span>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

function DesignCard({ design, active, onOpen }: { design: Design; active: boolean; onOpen: () => void }) {
  const m = design.report.workstation.metrics;
  return (
    <button
      className={`dcard ${active ? 'active' : ''}`}
      onClick={onOpen}
      style={{ '--dc': DESIGN_COLORS[design.id] } as CSSProperties}
    >
      <div className="dcard-top">
        <span className="dcard-letter">{design.id}</span>
        <span className="dcard-cost">
          <IconTag size={13} /> {usd(design.report.total_cost)}
        </span>
      </div>
      <h3>{design.name}</h3>
      <p>{design.tagline}</p>
      <ul>
        {design.report.placements.map((p, i) => (
          <li key={i}>{p.product_name}</li>
        ))}
      </ul>
      <div className="dcard-foot">
        <span>
          <IconRoute size={14} /> {m.route_from_entrance_m ?? '—'} m from entrance
        </span>
        <span className="dcard-open">
          <IconCube size={14} /> View in 3D
        </span>
      </div>
    </button>
  );
}

function ScanCard({ scan, active, onOpen, onUse }: { scan: ScanInfo; active: boolean; onOpen: () => void; onUse: () => void }) {
  return (
    <div className="answer">
      <p className="answer-summary">
        Your space is ready: <strong>{scan.room.width} × {scan.room.depth} m</strong>
        {scan.rooms.length ? `, ${scan.rooms.length} rooms (${scan.rooms.join(', ')})` : ''}, {scan.objects} objects found. Tell me who
        you're designing for and I'll plan three layouts in it.
      </p>
      <div className="scan-card">
        <span className="scan-card-icon">
          <IconBuilding size={20} />
        </span>
        <div>
          <strong>{scan.name}</strong>
          <span>Floor plan + 3D model, built by Claude from your video</span>
        </div>
        <div className="scan-card-actions">
          <button onClick={onOpen}>
            <IconCube size={14} /> View in 3D
          </button>
          <button className={active ? 'on' : ''} onClick={onUse} disabled={active}>
            {active ? (
              <>
                <IconCheck size={14} /> Designing here
              </>
            ) : (
              'Design for this space'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AssistantTurnProps {
  turn: Turn;
  activeDesignId: string | null;
  onOpenDesign: (designId: Design['id']) => void;
  onOpenScan: (scan: ScanInfo) => void;
  onUseScan: (scan: ScanInfo) => void;
  activeScanId: string | null;
}

export function AssistantTurn({ turn, activeDesignId, onOpenDesign, onOpenScan, onUseScan, activeScanId }: AssistantTurnProps) {
  return (
    <div className="msg msg-assistant">
      <div className={`avatar ${turn.status === 'running' ? 'thinking' : ''}`} aria-hidden="true">
        <i />
      </div>
      <div className="msg-body">
        {turn.sample && <div className="sample-note">Sample response for UI preview, not generated by the agent.</div>}
        {!turn.fromSaved && (turn.status === 'running' || (turn.events.length > 0 && !turn.reply) || turn.events.some((e) => e.type === 'tool')) && (
          <WorkingSteps turn={turn} />
        )}

        {turn.reply && <p className="answer-reply">{turn.reply}</p>}

        {turn.status === 'error' && (
          <div className="msg-error">
            <IconAlert size={16} />
            <span>{turn.error}</span>
          </div>
        )}

        {turn.scan && (
          <ScanCard scan={turn.scan} active={activeScanId === turn.scan.id} onOpen={() => onOpenScan(turn.scan!)} onUse={() => onUseScan(turn.scan!)} />
        )}

        {turn.plan && (
          <div className="answer">
            <p className="answer-summary">{turn.plan.summary}</p>
            <div className="dcards">
              {turn.plan.designs.map((d) => (
                <DesignCard key={d.id} design={d} active={activeDesignId === d.id} onOpen={() => onOpenDesign(d.id)} />
              ))}
            </div>
            <ProductList plan={turn.plan} />
            <p className="answer-hint">Open a design to walk through it in 3D, or ask for changes below.</p>
          </div>
        )}
      </div>
    </div>
  );
}
