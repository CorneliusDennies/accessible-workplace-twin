import type { SimpleFloorPlan } from './floorplan';

// Mirrors the OfficeData shape in src/types.ts (frontend). Kept as a local copy
// so the server package doesn't reach outside its own rootDir.
type Vec3 = [number, number, number];
interface Wall {
  id: string;
  position: Vec3;
  size: Vec3;
}
interface Door {
  id: string;
  roomId: string;
  position: Vec3;
  width: number;
  horizontal?: boolean;
}
interface Obstacle {
  id: string;
  type: string;
  position: Vec3;
  size: Vec3;
  hazard?: boolean;
}
interface Stairs {
  id: string;
  position: Vec3;
  size: Vec3;
  direction: 'up' | 'down';
}
interface OfficeData {
  id: string;
  name: string;
  rooms: unknown[];
  walls: Wall[];
  doors: Door[];
  obstacles: Obstacle[];
  stairs: Stairs[];
}

const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.2;
const OBSTACLE_HEIGHT = 1.5;
const STAIRS_HEIGHT = 0.5;

let nextId = 1;
function makeId(prefix: string) {
  return `${prefix}-${nextId++}`;
}

interface Point2D {
  x: number;
  z: number;
}

// Snaps a point onto the nearest wall's line (so doors don't float disconnected from any wall).
// Mirrors src/utils/wallGeometry.ts — kept as a local copy for the same rootDir reason as above.
function findNearestWall(
  point: Point2D,
  walls: Wall[],
  maxDistance = 1.5
): { point: Point2D; horizontal: boolean } | null {
  let best: { point: Point2D; distance: number; horizontal: boolean } | null = null;
  for (const wall of walls) {
    const [sx, , sz] = wall.size;
    const horizontal = sx >= sz;
    const half = (horizontal ? sx : sz) / 2;
    const a = horizontal
      ? { x: wall.position[0] - half, z: wall.position[2] }
      : { x: wall.position[0], z: wall.position[2] - half };
    const b = horizontal
      ? { x: wall.position[0] + half, z: wall.position[2] }
      : { x: wall.position[0], z: wall.position[2] + half };
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    let t = lengthSq === 0 ? 0 : ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projZ = a.z + t * dz;
    const distance = Math.hypot(point.x - projX, point.z - projZ);
    if (!best || distance < best.distance) {
      best = { point: { x: projX, z: projZ }, distance, horizontal };
    }
  }
  return best && best.distance <= maxDistance ? { point: best.point, horizontal: best.horizontal } : null;
}

export function convertFloorPlanToOfficeData(plan: SimpleFloorPlan): OfficeData {
  const walls: Wall[] = plan.walls.map((w) => {
    const length = Math.max(0.1, Math.hypot(w.x2 - w.x1, w.z2 - w.z1));
    const midX = (w.x1 + w.x2) / 2;
    const midZ = (w.z1 + w.z2) / 2;
    const horizontal = Math.abs(w.x2 - w.x1) >= Math.abs(w.z2 - w.z1);
    return {
      id: makeId('wall'),
      position: [midX, WALL_HEIGHT / 2, midZ],
      size: horizontal ? [length, WALL_HEIGHT, WALL_THICKNESS] : [WALL_THICKNESS, WALL_HEIGHT, length],
    };
  });

  const doors: Door[] = plan.doors.map((d) => {
    const snapped = findNearestWall({ x: d.x, z: d.z }, walls);
    const dp = snapped ? snapped.point : { x: d.x, z: d.z };
    return {
      id: makeId('door'),
      roomId: '',
      position: [dp.x, 0, dp.z],
      width: 1,
      horizontal: snapped ? snapped.horizontal : true,
    };
  });

  const stairs: Stairs[] = plan.stairs.map((s) => ({
    id: makeId('stairs'),
    position: [s.x, 0, s.z],
    size: [Math.max(0.5, s.width), STAIRS_HEIGHT, Math.max(0.5, s.depth)],
    direction: 'down',
  }));

  const obstacles: Obstacle[] = plan.obstacles.map((o) => ({
    id: makeId('obstacle'),
    type: 'obstacle',
    position: [o.x, OBSTACLE_HEIGHT / 2, o.z],
    size: [Math.max(0.3, o.width), OBSTACLE_HEIGHT, Math.max(0.3, o.depth)],
    hazard: true,
  }));

  return {
    id: 'imported-floor-plan',
    name: 'Imported Floor Plan',
    rooms: [],
    walls,
    doors,
    obstacles,
    stairs,
  };
}
