import type { Wall } from '../types';

export interface Point2D {
  x: number;
  z: number;
}

export interface WallSnapResult {
  point: Point2D;
  distance: number;
  horizontal: boolean;
}

function wallEndpoints(wall: Wall): [Point2D, Point2D] {
  const [sx, , sz] = wall.size;
  const horizontal = sx >= sz;
  const half = (horizontal ? sx : sz) / 2;
  const a = horizontal
    ? { x: wall.position[0] - half, z: wall.position[2] }
    : { x: wall.position[0], z: wall.position[2] - half };
  const b = horizontal
    ? { x: wall.position[0] + half, z: wall.position[2] }
    : { x: wall.position[0], z: wall.position[2] + half };
  return [a, b];
}

export function closestPointOnWall(point: Point2D, wall: Wall): WallSnapResult {
  const [a, b] = wallEndpoints(wall);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  let t = lengthSq === 0 ? 0 : ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projZ = a.z + t * dz;
  const distance = Math.hypot(point.x - projX, point.z - projZ);
  const [sx, , sz] = wall.size;
  return { point: { x: projX, z: projZ }, distance, horizontal: sx >= sz };
}

/** Finds the nearest wall to `point`, snapping onto its line, within `maxDistance` meters. */
export function findNearestWall(point: Point2D, walls: Wall[], maxDistance = 1.5): WallSnapResult | null {
  let best: WallSnapResult | null = null;
  for (const wall of walls) {
    const candidate = closestPointOnWall(point, wall);
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best && best.distance <= maxDistance ? best : null;
}
