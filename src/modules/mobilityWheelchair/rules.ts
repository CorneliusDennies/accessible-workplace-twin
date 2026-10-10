import type { OfficeData, Issue, Wall, Obstacle } from '../../types';

const MODULE_ID = 'mobilityWheelchair';

// ADA 2010 Standards §403.5 — Walking Surfaces: minimum 36in (0.914m) clear width
const MIN_CLEAR_WIDTH = 0.914;
// ADA 2010 Standards §404.2.3 — Doors: minimum 32in (0.813m) clear width
const MIN_DOOR_WIDTH = 0.813;

/**
 * Find walls that bound the corridor at a given z-coordinate (i.e. the wall's
 * z-extent covers that z), split into the nearest wall to the left (smaller x)
 * and the nearest wall to the right (larger x) of a given x-coordinate.
 */
function flankingWalls(walls: Wall[], x: number, z: number): { left?: Wall; right?: Wall } {
  let left: Wall | undefined;
  let right: Wall | undefined;

  for (const wall of walls) {
    const zHalf = wall.size[2] / 2;
    const zMin = wall.position[2] - zHalf;
    const zMax = wall.position[2] + zHalf;
    if (z < zMin || z > zMax) continue;

    if (wall.position[0] < x) {
      if (!left || wall.position[0] > left.position[0]) left = wall;
    } else if (wall.position[0] > x) {
      if (!right || wall.position[0] < right.position[0]) right = wall;
    }
  }

  return { left, right };
}

/**
 * Estimate the widest clear path (in meters) past an obstacle, given the
 * corridor walls that flank it. Returns the larger of the two gaps (left of
 * the obstacle to the left wall, right of the obstacle to the right wall),
 * since a wheelchair user only needs one sufficiently wide path through.
 */
function widestClearPath(officeData: OfficeData, obstacle: Obstacle): number | null {
  const { left, right } = flankingWalls(officeData.walls, obstacle.position[0], obstacle.position[2]);
  if (!left || !right) return null;

  const leftWallInnerFace = left.position[0] + left.size[0] / 2;
  const rightWallInnerFace = right.position[0] - right.size[0] / 2;
  const obstacleHalfWidth = obstacle.size[0] / 2;
  const obstacleLeftEdge = obstacle.position[0] - obstacleHalfWidth;
  const obstacleRightEdge = obstacle.position[0] + obstacleHalfWidth;

  const leftGap = obstacleLeftEdge - leftWallInnerFace;
  const rightGap = rightWallInnerFace - obstacleRightEdge;

  return Math.max(leftGap, rightGap);
}

export function analyze(officeData: OfficeData): Issue[] {
  const issues: Issue[] = [];

  for (const stairs of officeData.stairs) {
    issues.push({
      id: `issue-${stairs.id}-noAlternative`,
      moduleId: MODULE_ID,
      issueType: 'noAccessibleAlternative',
      severity: 'high',
      locationId: stairs.id,
      position: stairs.position,
      description: `Stairs "${stairs.id}" have no ramp or lift alternative for wheelchair users.`,
      standardReference: 'ADA 2010 Standards §405 — Ramps',
    });
  }

  for (const door of officeData.doors) {
    if (door.width < MIN_DOOR_WIDTH) {
      issues.push({
        id: `issue-${door.id}-narrowDoorway`,
        moduleId: MODULE_ID,
        issueType: 'narrowDoorway',
        severity: 'high',
        locationId: door.id,
        position: door.position,
        description: `Door "${door.id}" clear width (${door.width.toFixed(2)}m) is below the ADA minimum of ${MIN_DOOR_WIDTH}m (32in).`,
        standardReference: 'ADA 2010 Standards §404.2.3 — Clear Width of Doorways',
      });
    }
  }

  for (const obstacle of officeData.obstacles) {
    const clearPath = widestClearPath(officeData, obstacle);
    if (clearPath !== null && clearPath < MIN_CLEAR_WIDTH) {
      issues.push({
        id: `issue-${obstacle.id}-narrowPath`,
        moduleId: MODULE_ID,
        issueType: 'narrowPath',
        severity: 'medium',
        locationId: obstacle.id,
        position: obstacle.position,
        description: `Obstacle "${obstacle.id}" narrows the accessible route to ${clearPath.toFixed(2)}m, below the ADA minimum of ${MIN_CLEAR_WIDTH}m (36in).`,
        standardReference: 'ADA 2010 Standards §403.5 — Clear Width of Walking Surfaces',
      });
    }
  }

  return issues;
}
