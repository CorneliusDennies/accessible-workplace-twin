import type { Need } from './catalog';
import {
  ADA,
  type Floorplan,
  RouteGrid,
  doorClearZones,
  objectRect,
  turningSpaceNear,
  round,
  wallRects,
} from './floorplan';

export interface AuditIssue {
  id: string;
  need: Need;
  severity: 'high' | 'medium' | 'low';
  object_id: string | null;
  x: number;
  z: number;
  description: string;
  standard: string;
}

export function entranceOf(plan: Floorplan) {
  return plan.objects.find((o) => o.id === 'entrance') ?? plan.objects.find((o) => o.type === 'door');
}

/** A point just inside the entrance where a route can start. */
export function entrancePoint(plan: Floorplan, grid: RouteGrid): [number, number] | null {
  const door = entranceOf(plan);
  if (!door) return null;
  const inset = 0.6;
  const x = door.x < 0.5 ? inset : door.x > plan.room.width - 0.5 ? plan.room.width - inset : door.x;
  const z = door.z < 0.5 ? inset : door.z > plan.room.depth - 0.5 ? plan.room.depth - inset : door.z;
  return grid.nearestFree(x, z, 1.0);
}

function floorObstacles(plan: Floorplan) {
  return [...plan.objects.map(objectRect).filter((r) => r !== null), ...wallRects(plan)];
}

export function auditLayout(plan: Floorplan, needs: Need[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const has = (n: Need) => needs.includes(n);
  const obstacles = floorObstacles(plan);

  if (has('wheelchair')) {
    for (const door of plan.objects.filter((o) => o.type === 'door')) {
      if ((door.width ?? 0) < ADA.doorClearWidth) {
        issues.push({
          id: `${door.id}-narrow`,
          need: 'wheelchair',
          severity: 'high',
          object_id: door.id,
          x: door.x,
          z: door.z,
          description: `Door clear width ${door.width}m is under the 0.815m (32in) minimum.`,
          standard: 'ADA §404.2.3',
        });
      }
    }

    for (const walk of plan.walkways ?? []) {
      if (walk.min_width < ADA.routeWidth) {
        const target = plan.objects.find((o) => o.id === walk.to);
        issues.push({
          id: `walkway-${walk.from}-${walk.to}`,
          need: 'wheelchair',
          severity: 'high',
          object_id: walk.to,
          x: target?.x ?? 0,
          z: target?.z ?? 0,
          description: `Route ${walk.from} → ${walk.to} narrows to ${walk.min_width}m, under the 0.915m (36in) minimum.`,
          standard: 'ADA §403.5.1',
        });
      }
    }

    // Can a wheelchair actually reach each piece of furniture from the entrance?
    const grid = new RouteGrid(plan, obstacles);
    const start = entrancePoint(plan, grid);
    for (const o of plan.objects.filter((o) => ['desk', 'table', 'counter', 'shelf'].includes(o.type))) {
      const access = grid.nearestFree(o.x, o.z, 1.2);
      const reachable = start && access ? grid.pathLength(start, access) !== null : false;
      if (!reachable) {
        issues.push({
          id: `${o.id}-unreachable`,
          need: 'wheelchair',
          severity: 'high',
          object_id: o.id,
          x: o.x,
          z: o.z,
          description: `No 36in-wide route from the entrance reaches ${o.id}.`,
          standard: 'ADA §402 / §403.5.1 accessible routes',
        });
      }
    }

    for (const desk of plan.objects.filter((o) => o.type === 'desk')) {
      if (!turningSpaceNear(plan, obstacles, desk.x, desk.z, 1.4)) {
        issues.push({
          id: `${desk.id}-no-turning`,
          need: 'wheelchair',
          severity: 'medium',
          object_id: desk.id,
          x: desk.x,
          z: desk.z,
          description: `No 1.525m (60in) turning circle fits next to ${desk.id}.`,
          standard: 'ADA §304.3.1',
        });
      }
      const h = desk.height ?? 0.75;
      issues.push({
        id: `${desk.id}-fixed-height`,
        need: 'wheelchair',
        severity: h < ADA.workSurfaceMin || h > ADA.workSurfaceMax ? 'high' : 'low',
        object_id: desk.id,
        x: desk.x,
        z: desk.z,
        description: `${desk.id} is fixed at ${h}m. ${
          h < ADA.workSurfaceMin || h > ADA.workSurfaceMax ? 'Outside' : 'Inside'
        } the 0.71–0.865m range, but cannot adjust to an individual chair.`,
        standard: 'ADA §902.3',
      });
    }

    for (const shelf of plan.objects.filter((o) => o.type === 'shelf')) {
      const top = shelf.top_height ?? shelf.height ?? 0;
      if (top > ADA.reachHigh) {
        issues.push({
          id: `${shelf.id}-out-of-reach`,
          need: 'wheelchair',
          severity: 'medium',
          object_id: shelf.id,
          x: shelf.x,
          z: shelf.z,
          description: `${shelf.id} top is ${top}m, above the 1.22m (48in) forward reach limit.`,
          standard: 'ADA §308.2.1',
        });
      }
    }

    for (const counter of plan.objects.filter((o) => o.type === 'counter')) {
      const h = counter.height ?? 0;
      if (h > ADA.workSurfaceMax) {
        issues.push({
          id: `${counter.id}-too-high`,
          need: 'wheelchair',
          severity: 'medium',
          object_id: counter.id,
          x: counter.x,
          z: counter.z,
          description: `${counter.id} is ${h}m high, above the 0.865m (34in) maximum work surface.`,
          standard: 'ADA §902.3',
        });
      }
    }

    for (const zone of doorClearZones(plan)) {
      const blocker = obstacles.find((o) => o.x0 < zone.x1 && o.x1 > zone.x0 && o.z0 < zone.z1 && o.z1 > zone.z0);
      if (blocker) {
        issues.push({
          id: `${zone.id}-blocked`,
          need: 'wheelchair',
          severity: 'high',
          object_id: blocker.id,
          x: round((zone.x0 + zone.x1) / 2),
          z: round((zone.z0 + zone.z1) / 2),
          description: `${blocker.id} sits in the door maneuvering clearance.`,
          standard: 'ADA §404.2.4',
        });
      }
    }
  }

  if (has('deaf') || has('hard_of_hearing')) {
    const need: Need = has('deaf') ? 'deaf' : 'hard_of_hearing';
    for (const alert of plan.objects.filter((o) => o.type === 'audio_alert')) {
      const isFire = alert.id.includes('fire');
      issues.push({
        id: `${alert.id}-audio-only`,
        need,
        severity: isFire ? 'high' : 'medium',
        object_id: alert.id,
        x: alert.x,
        z: alert.z,
        description: `${alert.id} is audible only — no visual or tactile equivalent.`,
        standard: isFire ? 'ADA §702.1 (NFPA 72 visible notification)' : 'Best practice: visual signaler',
      });
    }
    for (const table of plan.objects.filter((o) => o.type === 'table')) {
      issues.push({
        id: `${table.id}-no-assistive-listening`,
        need,
        severity: 'low',
        object_id: table.id,
        x: table.x,
        z: table.z,
        description: `Meetings at ${table.id} have no captioning or assistive listening.`,
        standard: 'ADA §219 assistive listening (assembly areas); best practice for meeting rooms',
      });
    }
  }

  if (has('blind') || has('low_vision')) {
    const need: Need = has('blind') ? 'blind' : 'low_vision';
    const door = entranceOf(plan);
    if (door) {
      issues.push({
        id: `${door.id}-no-tactile-sign`,
        need,
        severity: 'medium',
        object_id: door.id,
        x: door.x,
        z: door.z,
        description: 'Entrance has no tactile or braille room identification.',
        standard: 'ADA §703.2–703.4',
      });
      issues.push({
        id: 'no-wayfinding',
        need,
        severity: 'medium',
        object_id: door.id,
        x: door.x,
        z: door.z,
        description: 'No tactile or audio wayfinding from the entrance to workstations.',
        standard: 'Best practice (ISO 23599); not an ADA requirement indoors',
      });
    }
    for (const o of plan.objects.filter((o) => ['counter', 'shelf'].includes(o.type))) {
      issues.push({
        id: `${o.id}-low-contrast`,
        need,
        severity: 'low',
        object_id: o.id,
        x: o.x,
        z: o.z,
        description: `${o.id} edges have no high-contrast marking.`,
        standard: 'Best practice',
      });
    }
  }

  return issues;
}
