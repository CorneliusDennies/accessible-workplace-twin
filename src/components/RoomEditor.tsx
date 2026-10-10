import { useState } from 'react';
import type { OfficeData, Wall, Door, Obstacle, Stairs, Vec3 } from '../types';

interface RoomEditorProps {
  initialOfficeData: OfficeData;
  onApply: (officeData: OfficeData) => void;
  onCancel: () => void;
}

type Tool = 'wall' | 'door' | 'stairs' | 'obstacle' | 'erase';

interface Point {
  x: number;
  z: number;
}

const METERS = 24;
const PX_PER_M = 28;
const SVG_SIZE = METERS * PX_PER_M;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.2;
const OBSTACLE_HEIGHT = 1.5;
const STAIRS_HEIGHT = 0.5;
const ERASE_RADIUS = 0.4;

function snap(v: number): number {
  return Math.round(v * 2) / 2;
}

function worldToPx(p: Point) {
  return { px: SVG_SIZE / 2 + p.x * PX_PER_M, py: SVG_SIZE / 2 + p.z * PX_PER_M };
}

function pxToWorld(px: number, py: number): Point {
  return { x: snap((px - SVG_SIZE / 2) / PX_PER_M), z: snap((py - SVG_SIZE / 2) / PX_PER_M) };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.z - a.z);
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projZ = a.z + t * dz;
  return Math.hypot(p.x - projX, p.z - projZ);
}

let nextId = 1;
function makeId(prefix: string) {
  return `${prefix}-${nextId++}`;
}

export function RoomEditor({ initialOfficeData, onApply, onCancel }: RoomEditorProps) {
  const [walls, setWalls] = useState<Wall[]>(initialOfficeData.walls);
  const [doors, setDoors] = useState<Door[]>(initialOfficeData.doors);
  const [obstacles, setObstacles] = useState<Obstacle[]>(initialOfficeData.obstacles);
  const [stairs, setStairs] = useState<Stairs[]>(initialOfficeData.stairs);

  const [tool, setTool] = useState<Tool>('wall');
  const [wallStart, setWallStart] = useState<Point | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  function eventToWorld(e: React.PointerEvent<SVGSVGElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * SVG_SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * SVG_SIZE;
    return pxToWorld(px, py);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    setCursor(eventToWorld(e));
  }

  function handleClick(e: React.PointerEvent<SVGSVGElement>) {
    const point = eventToWorld(e);

    if (tool === 'wall') {
      if (!wallStart) {
        setWallStart(point);
        return;
      }
      const dx = point.x - wallStart.x;
      const dz = point.z - wallStart.z;
      let end: Point;
      if (Math.abs(dx) >= Math.abs(dz)) {
        end = { x: point.x, z: wallStart.z };
      } else {
        end = { x: wallStart.x, z: point.z };
      }
      const length = Math.max(Math.abs(end.x - wallStart.x), Math.abs(end.z - wallStart.z));
      if (length > 0) {
        const midX = (wallStart.x + end.x) / 2;
        const midZ = (wallStart.z + end.z) / 2;
        const horizontal = Math.abs(end.x - wallStart.x) >= Math.abs(end.z - wallStart.z);
        const size: Vec3 = horizontal ? [length, WALL_HEIGHT, WALL_THICKNESS] : [WALL_THICKNESS, WALL_HEIGHT, length];
        setWalls((w) => [...w, { id: makeId('wall'), position: [midX, WALL_HEIGHT / 2, midZ], size }]);
      }
      setWallStart(null);
      return;
    }

    if (tool === 'door') {
      setDoors((d) => [...d, { id: makeId('door'), roomId: '', position: [point.x, 0, point.z], width: 1 }]);
      return;
    }

    if (tool === 'erase') {
      const click = point;
      let bestType: 'wall' | 'door' | 'obstacle' | 'stairs' | null = null;
      let bestId: string | null = null;
      let bestDist = ERASE_RADIUS;

      for (const w of walls) {
        const [hx, , hz] = w.size;
        const isHorizontal = hx >= hz;
        const half = (isHorizontal ? hx : hz) / 2;
        const a = isHorizontal
          ? { x: w.position[0] - half, z: w.position[2] }
          : { x: w.position[0], z: w.position[2] - half };
        const b = isHorizontal
          ? { x: w.position[0] + half, z: w.position[2] }
          : { x: w.position[0], z: w.position[2] + half };
        const dist = distToSegment(click, a, b);
        if (dist < bestDist) {
          bestDist = dist;
          bestType = 'wall';
          bestId = w.id;
        }
      }
      for (const list of [
        { items: doors, type: 'door' as const },
        { items: obstacles, type: 'obstacle' as const },
        { items: stairs, type: 'stairs' as const },
      ]) {
        for (const item of list.items) {
          const dist = Math.hypot(click.x - item.position[0], click.z - item.position[2]);
          if (dist < bestDist) {
            bestDist = dist;
            bestType = list.type;
            bestId = item.id;
          }
        }
      }

      if (bestType === 'wall') setWalls((w) => w.filter((x) => x.id !== bestId));
      else if (bestType === 'door') setDoors((d) => d.filter((x) => x.id !== bestId));
      else if (bestType === 'obstacle') setObstacles((o) => o.filter((x) => x.id !== bestId));
      else if (bestType === 'stairs') setStairs((s) => s.filter((x) => x.id !== bestId));
      return;
    }

    // stairs / obstacle: drag-to-size
    if (!dragStart) {
      setDragStart(point);
    }
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if ((tool !== 'stairs' && tool !== 'obstacle') || !dragStart) return;
    const point = eventToWorld(e);
    const sizeX = Math.max(0.5, Math.abs(point.x - dragStart.x));
    const sizeZ = Math.max(0.5, Math.abs(point.z - dragStart.z));
    const midX = (dragStart.x + point.x) / 2;
    const midZ = (dragStart.z + point.z) / 2;

    if (tool === 'stairs') {
      setStairs((s) => [
        ...s,
        { id: makeId('stairs'), position: [midX, 0, midZ], size: [sizeX, STAIRS_HEIGHT, sizeZ], direction: 'down' },
      ]);
    } else {
      setObstacles((o) => [
        ...o,
        {
          id: makeId('obstacle'),
          type: 'obstacle',
          position: [midX, OBSTACLE_HEIGHT / 2, midZ],
          size: [sizeX, OBSTACLE_HEIGHT, sizeZ],
          hazard: true,
        },
      ]);
    }
    setDragStart(null);
  }

  function handleApply() {
    onApply({
      id: 'custom-office',
      name: 'My Workplace',
      rooms: [],
      walls,
      doors,
      obstacles,
      stairs,
    });
  }

  function handleClear() {
    setWalls([]);
    setDoors([]);
    setObstacles([]);
    setStairs([]);
    setWallStart(null);
    setDragStart(null);
  }

  return (
    <div className="room-editor">
      <div className="room-editor-toolbar">
        {(['wall', 'door', 'stairs', 'obstacle', 'erase'] as Tool[]).map((t) => (
          <button
            key={t}
            className={tool === t ? 'active' : ''}
            onClick={() => {
              setTool(t);
              setWallStart(null);
              setDragStart(null);
            }}
          >
            {t}
          </button>
        ))}
        <span className="room-editor-hint">
          {tool === 'wall' && 'Click start, click end (snaps to horizontal/vertical).'}
          {tool === 'door' && 'Click to place a door.'}
          {tool === 'stairs' && 'Click-drag to draw the stairs footprint.'}
          {tool === 'obstacle' && 'Click-drag to draw an obstacle (flagged as a hazard).'}
          {tool === 'erase' && 'Click near an element to delete it.'}
        </span>
      </div>

      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="room-editor-canvas"
        onPointerMove={handlePointerMove}
        onPointerDown={handleClick}
        onPointerUp={handlePointerUp}
      >
        {Array.from({ length: METERS + 1 }).map((_, i) => (
          <line
            key={`gx${i}`}
            x1={i * PX_PER_M}
            y1={0}
            x2={i * PX_PER_M}
            y2={SVG_SIZE}
            stroke="#2a2b33"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: METERS + 1 }).map((_, i) => (
          <line
            key={`gy${i}`}
            x1={0}
            y1={i * PX_PER_M}
            x2={SVG_SIZE}
            y2={i * PX_PER_M}
            stroke="#2a2b33"
            strokeWidth={1}
          />
        ))}

        {walls.map((w) => {
          const [sx, , sz] = w.size;
          const horizontal = sx >= sz;
          const half = (horizontal ? sx : sz) / 2;
          const a = horizontal
            ? { x: w.position[0] - half, z: w.position[2] }
            : { x: w.position[0], z: w.position[2] - half };
          const b = horizontal
            ? { x: w.position[0] + half, z: w.position[2] }
            : { x: w.position[0], z: w.position[2] + half };
          const pa = worldToPx(a);
          const pb = worldToPx(b);
          return (
            <line key={w.id} x1={pa.px} y1={pa.py} x2={pb.px} y2={pb.py} stroke="#9aa0a8" strokeWidth={6} />
          );
        })}

        {doors.map((d) => {
          const { px, py } = worldToPx({ x: d.position[0], z: d.position[2] });
          return <circle key={d.id} cx={px} cy={py} r={6} fill="#5a4632" stroke="#eee" strokeWidth={1} />;
        })}

        {obstacles.map((o) => {
          const { px, py } = worldToPx({ x: o.position[0], z: o.position[2] });
          const w = o.size[0] * PX_PER_M;
          const h = o.size[2] * PX_PER_M;
          return (
            <rect
              key={o.id}
              x={px - w / 2}
              y={py - h / 2}
              width={w}
              height={h}
              fill="#e07a3f"
              opacity={0.8}
            />
          );
        })}

        {stairs.map((s) => {
          const { px, py } = worldToPx({ x: s.position[0], z: s.position[2] });
          const w = s.size[0] * PX_PER_M;
          const h = s.size[2] * PX_PER_M;
          return (
            <rect
              key={s.id}
              x={px - w / 2}
              y={py - h / 2}
              width={w}
              height={h}
              fill="#7a7f87"
              stroke="#ccc"
              strokeWidth={1}
            />
          );
        })}

        {tool === 'wall' && wallStart && cursor && (
          <line
            x1={worldToPx(wallStart).px}
            y1={worldToPx(wallStart).py}
            x2={worldToPx(Math.abs(cursor.x - wallStart.x) >= Math.abs(cursor.z - wallStart.z)
              ? { x: cursor.x, z: wallStart.z }
              : { x: wallStart.x, z: cursor.z }).px}
            y2={worldToPx(Math.abs(cursor.x - wallStart.x) >= Math.abs(cursor.z - wallStart.z)
              ? { x: cursor.x, z: wallStart.z }
              : { x: wallStart.x, z: cursor.z }).py}
            stroke="#f2c230"
            strokeWidth={4}
            strokeDasharray="4 4"
          />
        )}

        {(tool === 'stairs' || tool === 'obstacle') && dragStart && cursor && (
          <rect
            x={Math.min(worldToPx(dragStart).px, worldToPx(cursor).px)}
            y={Math.min(worldToPx(dragStart).py, worldToPx(cursor).py)}
            width={Math.abs(worldToPx(cursor).px - worldToPx(dragStart).px)}
            height={Math.abs(worldToPx(cursor).py - worldToPx(dragStart).py)}
            fill="none"
            stroke="#f2c230"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
      </svg>

      <div className="room-editor-actions">
        <button onClick={handleClear}>Clear</button>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={handleApply}>
          Use this layout
        </button>
      </div>
    </div>
  );
}
