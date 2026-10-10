import type { ScanInfo } from './api';
import { IconClose } from './icons';
import { RoomViewer } from './RoomViewer';

// Preview of a scanned space before any designs exist.
export function ScanPanel({ scan, onClose }: { scan: ScanInfo; onClose: () => void }) {
  return (
    <aside className="panel" aria-label="Scanned space">
      <header className="panel-head">
        <div className="panel-title">{scan.name}</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <IconClose size={18} />
        </button>
      </header>

      <RoomViewer glbUrl={scan.glbUrl} room={scan.room} design={null} />

      <div className="panel-body">
        <h2>Your scanned space</h2>
        <p className="panel-tagline">Built from your walkthrough video. Tell me who you're designing for and I'll plan three layouts in this space.</p>

        <div className="stats">
          <div>
            <span>Footprint</span>
            <strong>
              {scan.room.width} × {scan.room.depth} m
            </strong>
          </div>
          <div>
            <span>Rooms</span>
            <strong>{scan.rooms.length || 1}</strong>
          </div>
          <div>
            <span>Objects found</span>
            <strong>{scan.objects}</strong>
          </div>
        </div>

        {scan.rooms.length > 0 && (
          <>
            <h4>Rooms</h4>
            <div className="walks">
              {scan.rooms.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>
          </>
        )}

        {scan.source && (
          <>
            <h4>How it was built</h4>
            <p className="scan-source">{scan.source}</p>
          </>
        )}
      </div>
    </aside>
  );
}
