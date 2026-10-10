// Floorplan schema (same as data/demo-floorplan.json) plus the geometry the
// planner tools need: footprints, clearance, and an occupancy grid for
// "does a 36in-wide route exist" checks.
//
// Coordinates: meters, x across the room (0..width), z into the room (0..depth),
// object x/z are footprint centers. These match the 3D viewer's world space.

export interface FloorplanObject {
  id: string;
  type: string;
  x: number;
  z: number;
  w?: number;
  d?: number;
  width?: number; // doors
  height?: number;
  top_height?: number; // shelves
}

export interface Walkway {
  from: string;
  to: string;
  min_width: number;
}

// Interior wall between rooms: an axis-aligned segment (from the video-to-room scans).
export interface WallSegment {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  thickness?: number;
}

export interface Floorplan {
  units: 'meters';
  room: { width: number; depth: number; wall_height?: number };
  rooms?: { id: string; name: string; x0: number; z0: number; x1: number; z1: number }[];
  walls?: WallSegment[];
  objects: FloorplanObject[];
  walkways?: Walkway[];
}

export interface Rect {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

// ADA 2010 Standards, in meters.
export const ADA = {
  routeWidth: 0.915, // §403.5.1 clear width of walking surfaces, 36in
  doorClearWidth: 0.815, // §404.2.3 door clear width, 32in
  turningDiameter: 1.525, // §304.3.1 turning space circle, 60in
  reachHigh: 1.22, // §308.2.1 unobstructed forward reach, 48in max
  reachLow: 0.38, // §308.2.1 15in min
  workSurfaceMin: 0.71, // §902.3 28in
  workSurfaceMax: 0.865, // §902.3 34in
} as const;

// Furniture that occupies floor space. Doors and wall-mounted alerts don't.
const FLOOR_TYPES = new Set(['desk', 'table', 'shelf', 'counter', 'chair', 'cabinet', 'sofa', 'pillar']);

export function isFloorObject(o: FloorplanObject): boolean {
  return FLOOR_TYPES.has(o.type) && o.w !== undefined && o.d !== undefined;
}

export function rectOf(id: string, x: number, z: number, w: number, d: number): Rect {
  return { id, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
}

export function objectRect(o: FloorplanObject): Rect | null {
  if (!isFloorObject(o)) return null;
  return rectOf(o.id, o.x, o.z, o.w!, o.d!);
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

/** Gap between two rects (0 if they touch or overlap). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const dz = Math.max(0, Math.max(a.z0, b.z0) - Math.min(a.z1, b.z1));
  return Math.hypot(dx, dz);
}

export function pointRectDistance(x: number, z: number, r: Rect): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

export function distanceToNearestWall(plan: Floorplan, x: number, z: number): number {
  return Math.min(x, plan.room.width - x, z, plan.room.depth - z);
}

export function findObject(plan: Floorplan, id: string): FloorplanObject | undefined {
  return plan.objects.find((o) => o.id === id);
}

const isHorizontal = (w: WallSegment) => Math.abs(w.z1 - w.z0) < Math.abs(w.x1 - w.x0);

/** Interior wall the door sits in, if any. */
function wallOfDoor(plan: Floorplan, door: FloorplanObject): WallSegment | undefined {
  return (plan.walls ?? []).find((w) =>
    isHorizontal(w)
      ? Math.abs(door.z - w.z0) < 0.2 && door.x >= Math.min(w.x0, w.x1) - 0.1 && door.x <= Math.max(w.x0, w.x1) + 0.1
      : Math.abs(door.x - w.x0) < 0.2 && door.z >= Math.min(w.z0, w.z1) - 0.1 && door.z <= Math.max(w.z0, w.z1) + 0.1,
  );
}

/**
 * Interior walls as solid obstacles, with gaps cut where doors sit in them,
 * so routes can only pass between rooms through doorways.
 */
export function wallRects(plan: Floorplan): Rect[] {
  const rects: Rect[] = [];
  const doors = plan.objects.filter((o) => o.type === 'door');
  for (const wall of plan.walls ?? []) {
    const t = wall.thickness ?? 0.1;
    const horizontal = isHorizontal(wall);
    const a0 = horizontal ? Math.min(wall.x0, wall.x1) : Math.min(wall.z0, wall.z1);
    const a1 = horizontal ? Math.max(wall.x0, wall.x1) : Math.max(wall.z0, wall.z1);
    const line = horizontal ? wall.z0 : wall.x0;
    const gaps = doors
      .filter((d) => wallOfDoor(plan, d) === wall)
      .map((d) => {
        const c = horizontal ? d.x : d.z;
        const half = (d.width ?? 0.9) / 2;
        return [c - half, c + half] as const;
      })
      .sort((p, q) => p[0] - q[0]);
    let cursor = a0;
    const pieces: [number, number][] = [];
    for (const [g0, g1] of gaps) {
      if (g0 > cursor) pieces.push([cursor, Math.min(g0, a1)]);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < a1) pieces.push([cursor, a1]);
    pieces.forEach(([p0, p1], i) => {
      const mid = (p0 + p1) / 2;
      const len = p1 - p0;
      rects.push(horizontal ? rectOf(`${wall.id}_${i}`, mid, line, len, t) : rectOf(`${wall.id}_${i}`, line, mid, t, len));
    });
  }
  return rects;
}

/** Clear zone in front of each door that must stay free (ADA §404.2.4 maneuvering clearance, simplified). */
export function doorClearZones(plan: Floorplan): Rect[] {
  const depth = 1.525;
  return plan.objects
    .filter((o) => o.type === 'door')
    .map((door) => {
      const w = (door.width ?? 0.9) + 0.3;
      if (door.x < 0.5) return rectOf(`${door.id}_clearance`, depth / 2, door.z, depth, w);
      if (door.x > plan.room.width - 0.5) return rectOf(`${door.id}_clearance`, plan.room.width - depth / 2, door.z, depth, w);
      if (door.z < 0.5) return rectOf(`${door.id}_clearance`, door.x, depth / 2, w, depth);
      if (door.z > plan.room.depth - 0.5) return rectOf(`${door.id}_clearance`, door.x, plan.room.depth - depth / 2, w, depth);
      // Interior doorway: clearance on both sides of its wall.
      const wall = wallOfDoor(plan, door);
      const across = wall && !isHorizontal(wall);
      return across
        ? rectOf(`${door.id}_clearance`, door.x, door.z, 2 * 0.9, w)
        : rectOf(`${door.id}_clearance`, door.x, door.z, w, 2 * 0.9);
    });
}

const CELL = 0.1;

/**
 * Occupancy grid where a cell is free only if a wheelchair of route width
 * centered there clears every obstacle and wall. A path through free cells
 * therefore proves a route at least `clearWidth` wide exists.
 */
export class RouteGrid {
  readonly cols: number;
  readonly rows: number;
  private free: Uint8Array;

  constructor(plan: Floorplan, obstacles: Rect[], clearWidth: number = ADA.routeWidth) {
    const r = clearWidth / 2;
    this.cols = Math.round(plan.room.width / CELL);
    this.rows = Math.round(plan.room.depth / CELL);
    this.free = new Uint8Array(this.cols * this.rows);
    for (let c = 0; c < this.cols; c++) {
      for (let k = 0; k < this.rows; k++) {
        const x = (c + 0.5) * CELL;
        const z = (k + 0.5) * CELL;
        if (distanceToNearestWall(plan, x, z) < r) continue;
        if (obstacles.some((o) => pointRectDistance(x, z, o) < r)) continue;
        this.free[k * this.cols + c] = 1;
      }
    }
  }

  private cellOf(x: number, z: number): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL))),
      Math.min(this.rows - 1, Math.max(0, Math.floor(z / CELL))),
    ];
  }

  isFree(x: number, z: number): boolean {
    const [c, k] = this.cellOf(x, z);
    return this.free[k * this.cols + c] === 1;
  }

  /** Nearest free cell center within `radius` of (x, z), or null. */
  nearestFree(x: number, z: number, radius: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    const steps = Math.ceil(radius / CELL);
    const [c0, k0] = this.cellOf(x, z);
    for (let dc = -steps; dc <= steps; dc++) {
      for (let dk = -steps; dk <= steps; dk++) {
        const c = c0 + dc;
        const k = k0 + dk;
        if (c < 0 || k < 0 || c >= this.cols || k >= this.rows || !this.free[k * this.cols + c]) continue;
        const cx = (c + 0.5) * CELL;
        const cz = (k + 0.5) * CELL;
        const d = Math.hypot(cx - x, cz - z);
        if (d <= radius && d < bestD) {
          bestD = d;
          best = [cx, cz];
        }
      }
    }
    return best;
  }

  /** Shortest 8-connected path length in meters between two free points, or null if unreachable. */
  pathLength(from: [number, number], to: [number, number]): number | null {
    return this.shortestPath(from, to)?.length ?? null;
  }

  /** Shortest route with simplified waypoints (cell centers, meters), or null if unreachable. */
  shortestPath(from: [number, number], to: [number, number]): { length: number; points: [number, number][] } | null {
    const [sc, sk] = this.cellOf(...from);
    const [tc, tk] = this.cellOf(...to);
    const start = sk * this.cols + sc;
    const goal = tk * this.cols + tc;
    if (!this.free[start] || !this.free[goal]) return null;

    // Dijkstra with a tiny binary heap; the grid is ~10k cells.
    const dist = new Float64Array(this.cols * this.rows).fill(Infinity);
    const prev = new Int32Array(this.cols * this.rows).fill(-1);
    const heap: [number, number][] = [[0, start]];
    dist[start] = 0;
    const push = (item: [number, number]) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };

    while (heap.length) {
      const [d, cell] = pop();
      if (cell === goal) return { length: d * CELL, points: this.waypoints(prev, goal) };
      if (d > dist[cell]) continue;
      const c = cell % this.cols;
      const k = (cell - c) / this.cols;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dk = -1; dk <= 1; dk++) {
          if (!dc && !dk) continue;
          const nc = c + dc;
          const nk = k + dk;
          if (nc < 0 || nk < 0 || nc >= this.cols || nk >= this.rows) continue;
          const n = nk * this.cols + nc;
          if (!this.free[n]) continue;
          const nd = d + (dc && dk ? Math.SQRT2 : 1);
          if (nd < dist[n]) {
            dist[n] = nd;
            prev[n] = cell;
            push([nd, n]);
          }
        }
      }
    }
    return null;
  }

  // Walk predecessors back from the goal, keeping only the cells where the direction changes.
  private waypoints(prev: Int32Array, goal: number): [number, number][] {
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = prev[c]) cells.push(c);
    cells.reverse();
    const center = (cell: number): [number, number] => {
      const c = cell % this.cols;
      return [round((c + 0.5) * CELL), round(((cell - c) / this.cols + 0.5) * CELL)];
    };
    const points: [number, number][] = [center(cells[0])];
    for (let i = 1; i < cells.length - 1; i++) {
      const step = (a: number, b: number) => [(b % this.cols) - (a % this.cols), Math.floor(b / this.cols) - Math.floor(a / this.cols)].join();
      if (step(cells[i - 1], cells[i]) !== step(cells[i], cells[i + 1])) points.push(center(cells[i]));
    }
    if (cells.length > 1) points.push(center(cells[cells.length - 1]));
    return points;
  }
}

/** Is there room for a 60in turning circle centered within `searchRadius` of (x, z)? */
export function turningSpaceNear(plan: Floorplan, obstacles: Rect[], x: number, z: number, searchRadius = 1.0): [number, number] | null {
  const grid = new RouteGrid(plan, obstacles, ADA.turningDiameter);
  return grid.nearestFree(x, z, searchRadius);
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
