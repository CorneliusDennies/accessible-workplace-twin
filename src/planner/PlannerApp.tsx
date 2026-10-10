import { OfficeViewer } from './OfficeViewer';
import './planner.css';

const PRODUCT_NAME = 'Creel';
const DEMO_GLB_URL = '/demo/demo-office.glb';

// ?glb=/demo/worldlabs-test.glb swaps in another model, e.g. a fresh World Labs export.
const glbUrl = new URLSearchParams(window.location.search).get('glb') ?? DEMO_GLB_URL;

export function PlannerApp() {
  return (
    <div className="planner">
      <main className="planner-viewer">
        <OfficeViewer glbUrl={glbUrl} />
        <div className="viewer-hint">Drag to orbit · scroll to zoom · right-drag to pan</div>
      </main>
      <aside className="planner-sidebar">
        <header>
          <h1>{PRODUCT_NAME}</h1>
          <p className="tagline">AI accessibility planner for office renovations</p>
        </header>
        <section className="card">
          <h2>Demo office</h2>
          <p>12 × 8 m open office loaded from <code>demo-office.glb</code>.</p>
        </section>
      </aside>
    </div>
  );
}
