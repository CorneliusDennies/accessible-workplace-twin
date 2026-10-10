import { getProduct, WALL_SNAP, type CatalogProduct, type Need } from './catalog';
import { entrancePoint } from './audit';
import {
  ADA,
  type Floorplan,
  type Rect,
  RouteGrid,
  distanceToNearestWall,
  doorClearZones,
  findObject,
  objectRect,
  rectOf,
  rectsOverlap,
  round,
  turningSpaceNear,
  wallRects,
} from './floorplan';

export interface PlacementInput {
  product_id: string;
  x: number;
  z: number;
  rotation_deg: 0 | 90;
  target_object_id: string | null;
  reason: string;
}

export interface WorkstationInput {
  x: number;
  z: number;
}

export interface DesignInput {
  name: string;
  tagline: string;
  workstation: WorkstationInput;
  placements: PlacementInput[];
  pros: string[];
  cons: string[];
  best_for: string[];
}

/** A placement with its final world transform, ready for the 3D viewer. */
export interface ResolvedPlacement extends PlacementInput {
  product_name: string;
  mount: CatalogProduct['mount'];
  unit_cost: number;
  y: number; // bottom of the item, meters
  size: { w: number; d: number; h: number };
  replaces_object_id: string | null;
}

export interface PlacementCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  resolved?: ResolvedPlacement;
}

// Obstacles after applying already-resolved placements (replacements remove the original).
function currentObstacles(plan: Floorplan, placed: ResolvedPlacement[]): Rect[] {
  const removed = new Set(placed.map((p) => p.replaces_object_id).filter(Boolean));
  const rects: Rect[] = plan.objects
    .filter((o) => !removed.has(o.id))
    .map(objectRect)
    .filter((r): r is Rect => r !== null);
  rects.push(...wallRects(plan));
  for (const p of placed) {
    if (p.mount === 'floor') rects.push(rectOf(`placed:${p.product_id}`, p.x, p.z, p.size.w, p.size.d));
  }
  return rects;
}

/** Furniture that someone has to be able to reach, after replacements. */
function destinations(plan: Floorplan, placed: ResolvedPlacement[]) {
  const removed = new Set(placed.map((p) => p.replaces_object_id).filter(Boolean));
  const out = plan.objects
    .filter((o) => ['desk', 'table', 'counter', 'shelf'].includes(o.type) && !removed.has(o.id))
    .map((o) => ({ id: o.id, x: o.x, z: o.z }));
  for (const p of placed) {
    if (p.mount === 'floor') out.push({ id: `placed:${p.product_id}`, x: p.x, z: p.z });
  }
  return out;
}

/** Desk surfaces a desk-mounted product or the workstation can attach to. */
function deskSurfaces(plan: Floorplan, placed: ResolvedPlacement[]) {
  const removed = new Set(placed.map((p) => p.replaces_object_id).filter(Boolean));
  const out = plan.objects
    .filter((o) => (o.type === 'desk' || o.type === 'table') && !removed.has(o.id))
    .map((o) => ({ id: o.id, rect: objectRect(o)!, height: o.height ?? 0.75 }));
  for (const p of placed) {
    if (p.product_id === 'sit-stand-desk') {
      // Targeting the replaced desk's id resolves to the new desk.
      out.push({ id: p.replaces_object_id ?? `placed:${p.product_id}`, rect: rectOf('', p.x, p.z, p.size.w, p.size.d), height: p.size.h });
    }
  }
  return out;
}

export function checkPlacement(plan: Floorplan, input: PlacementInput, placed: ResolvedPlacement[]): PlacementCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const product = getProduct(input.product_id);
  if (!product) return { ok: false, errors: [`Unknown product_id "${input.product_id}". Use search_products.`], warnings };

  const base = {
    ...input,
    product_name: product.name,
    mount: product.mount,
    unit_cost: product.unitCost,
    replaces_object_id: null as string | null,
  };

  switch (product.mount) {
    case 'floor':
    case 'floor_flat': {
      const fp = product.footprint!;
      const [w, d] = input.rotation_deg === 90 ? [fp.d, fp.w] : [fp.w, fp.d];
      const rect = rectOf('new', input.x, input.z, w, d);
      if (rect.x0 < 0 || rect.z0 < 0 || rect.x1 > plan.room.width || rect.z1 > plan.room.depth) {
        errors.push(`Footprint ${w}×${d}m at (${input.x}, ${input.z}) extends outside the ${plan.room.width}×${plan.room.depth}m room.`);
      }

      let replaces: string | null = null;
      if (input.target_object_id) {
        const target = findObject(plan, input.target_object_id);
        if (!target) errors.push(`target_object_id "${input.target_object_id}" does not exist.`);
        else if (product.replaces?.includes(target.type)) replaces = target.id;
        else if (product.mount === 'floor') errors.push(`${product.id} cannot replace a ${target.type}; set target_object_id to null.`);
      }
      if (replaces && placed.some((p) => p.replaces_object_id === replaces)) {
        errors.push(`${replaces} is already replaced by another placement in this design.`);
      }

      const obstacles = currentObstacles(plan, placed).filter((r) => r.id !== replaces);
      for (const o of obstacles) {
        if (rectsOverlap(rect, o)) errors.push(`Overlaps ${o.id}.`);
      }

      if (product.mount === 'floor') {
        for (const zone of doorClearZones(plan)) {
          if (rectsOverlap(rect, zone)) errors.push(`Blocks the door maneuvering clearance (${zone.id}, ADA §404.2.4).`);
        }
        const resolved: ResolvedPlacement = { ...base, y: 0, size: { w, d, h: fp.h }, replaces_object_id: replaces };
        // A placement must not cut off any 36in route that existed before it.
        // (Scanned spaces often have rooms that were never reachable; those aren't this placement's fault.)
        const reachable = (state: ResolvedPlacement[]) => {
          const grid = new RouteGrid(plan, currentObstacles(plan, state));
          const start = entrancePoint(plan, grid);
          const ok = new Set<string>();
          if (!start) return ok;
          for (const dest of destinations(plan, state)) {
            const access = grid.nearestFree(dest.x, dest.z, 1.2);
            if (access && grid.pathLength(start, access) !== null) ok.add(dest.id);
          }
          return ok;
        };
        const before = reachable(placed);
        const after = reachable([...placed, resolved]);
        for (const id of before) {
          if (!after.has(id)) errors.push(`Cuts off the 36in route from the entrance to ${id} (ADA §403.5.1).`);
        }
        return { ok: errors.length === 0, errors, warnings, resolved: errors.length ? undefined : resolved };
      }

      const resolved: ResolvedPlacement = { ...base, y: 0, size: { w, d, h: fp.h }, replaces_object_id: null };
      return { ok: errors.length === 0, errors, warnings, resolved: errors.length ? undefined : resolved };
    }

    case 'wall': {
      const gap = distanceToNearestWall(plan, input.x, input.z);
      if (gap > WALL_SNAP) errors.push(`Wall-mounted items must be within ${WALL_SNAP}m of a wall; (${input.x}, ${input.z}) is ${round(gap)}m away.`);
      // Snap onto the nearest wall face.
      const W = plan.room.width;
      const D = plan.room.depth;
      const sides = [
        { d: input.x, x: 0.03, z: input.z },
        { d: W - input.x, x: W - 0.03, z: input.z },
        { d: input.z, x: input.x, z: 0.03 },
        { d: D - input.z, x: input.x, z: D - 0.03 },
      ].sort((a, b) => a.d - b.d);
      const snap = sides[0];
      for (const door of plan.objects.filter((o) => o.type === 'door')) {
        const onSameWall = Math.abs(door.x - snap.x) < 0.5 || Math.abs(door.z - snap.z) < 0.5;
        const along = Math.abs(door.x - snap.x) < 0.5 ? Math.abs(door.z - snap.z) : Math.abs(door.x - snap.x);
        if (onSameWall && along < (door.width ?? 0.9) / 2) errors.push(`Would be mounted inside the ${door.id} opening.`);
      }
      const resolved: ResolvedPlacement = {
        ...base,
        x: round(snap.x),
        z: round(snap.z),
        y: product.mountHeight ?? 1.5,
        size: { w: 0.25, d: 0.05, h: 0.2 },
        replaces_object_id: null,
      };
      return { ok: errors.length === 0, errors, warnings, resolved: errors.length ? undefined : resolved };
    }

    case 'desk': {
      if (!input.target_object_id) {
        return { ok: false, errors: ['Desk-mounted items need target_object_id of a desk or table.'], warnings };
      }
      const surface = deskSurfaces(plan, placed).find((s) => s.id === input.target_object_id);
      if (!surface) {
        errors.push(`"${input.target_object_id}" is not a desk or table (or was replaced — target the replaced desk's id after placing the new desk).`);
        return { ok: false, errors, warnings };
      }
      const resolved: ResolvedPlacement = {
        ...base,
        x: round((surface.rect.x0 + surface.rect.x1) / 2),
        z: round((surface.rect.z0 + surface.rect.z1) / 2),
        y: surface.height,
        size: { w: 0.3, d: 0.2, h: 0.15 },
        replaces_object_id: null,
      };
      return { ok: true, errors, warnings, resolved };
    }

    case 'door': {
      const door = input.target_object_id ? findObject(plan, input.target_object_id) : undefined;
      if (!door || door.type !== 'door') {
        return { ok: false, errors: ['Door-mounted items need target_object_id of a door.'], warnings };
      }
      const resolved: ResolvedPlacement = {
        ...base,
        x: door.x,
        z: door.z,
        y: 2.0,
        size: { w: 0.15, d: 0.6, h: 0.12 },
        replaces_object_id: null,
      };
      return { ok: true, errors, warnings, resolved };
    }
  }
}

export interface WorkstationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    route_from_entrance_m: number | null;
    turning_space: boolean;
    desk_id: string | null;
    walk_to_m: Record<string, number | null>;
    route_path: [number, number][]; // entrance → seat, for drawing
  };
}

export function evaluateWorkstation(
  plan: Floorplan,
  ws: WorkstationInput,
  placed: ResolvedPlacement[],
  needs: Need[],
): WorkstationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const obstacles = currentObstacles(plan, placed);

  const desk = deskSurfaces(plan, placed)
    .map((s) => ({ ...s, gap: Math.hypot(
      Math.max(s.rect.x0 - ws.x, 0, ws.x - s.rect.x1),
      Math.max(s.rect.z0 - ws.z, 0, ws.z - s.rect.z1),
    ) }))
    .sort((a, b) => a.gap - b.gap)[0];
  if (!desk || desk.gap > 0.9) errors.push('Workstation seat must be within 0.9m of a desk.');
  if (obstacles.some((o) => ws.x > o.x0 && ws.x < o.x1 && ws.z > o.z0 && ws.z < o.z1)) {
    errors.push('Workstation seat is inside a piece of furniture; put it beside the desk.');
  }

  const grid = new RouteGrid(plan, obstacles);
  const start = entrancePoint(plan, grid);
  const seat = grid.nearestFree(ws.x, ws.z, 0.6);
  const path = start && seat ? grid.shortestPath(start, seat) : null;
  const route = path?.length ?? null;
  if (route === null) {
    (needs.includes('wheelchair') ? errors : warnings).push('No 36in-wide route from the entrance reaches the seat (ADA §403.5.1).');
  }

  const turning = turningSpaceNear(plan, obstacles, ws.x, ws.z, 1.0) !== null;
  if (!turning && needs.includes('wheelchair')) errors.push('No 60in turning circle within 1m of the seat (ADA §304.3.1).');

  const walk_to_m: Record<string, number | null> = { entrance: route === null ? null : round(route, 1) };
  if (seat) {
    for (const o of plan.objects.filter((o) => ['table', 'counter', 'shelf'].includes(o.type))) {
      const access = grid.nearestFree(o.x, o.z, 1.2);
      const d = access ? grid.pathLength(seat, access) : null;
      walk_to_m[o.id] = d === null ? null : round(d, 1);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      route_from_entrance_m: walk_to_m.entrance,
      turning_space: turning,
      desk_id: desk?.id ?? null,
      walk_to_m,
      route_path: path?.points ?? [],
    },
  };
}

export interface DesignReport {
  ok: boolean;
  errors: string[];
  placements: ResolvedPlacement[];
  workstation: WorkstationReport;
  total_cost: number;
}

export function evaluateDesign(plan: Floorplan, design: DesignInput, needs: Need[]): DesignReport {
  const errors: string[] = [];
  if (design.placements.length < 2 || design.placements.length > 3) {
    errors.push(`Each design needs 2–3 products; got ${design.placements.length}.`);
  }
  const placed: ResolvedPlacement[] = [];
  design.placements.forEach((p, i) => {
    const check = checkPlacement(plan, p, placed);
    if (check.resolved) placed.push(check.resolved);
    else errors.push(...check.errors.map((e) => `placement ${i + 1} (${p.product_id}): ${e}`));
  });
  const workstation = evaluateWorkstation(plan, design.workstation, placed, needs);
  errors.push(...workstation.errors.map((e) => `workstation: ${e}`));
  return {
    ok: errors.length === 0,
    errors,
    placements: placed,
    workstation,
    total_cost: placed.reduce((sum, p) => sum + p.unit_cost, 0),
  };
}
