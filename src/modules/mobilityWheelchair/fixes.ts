import type { Issue, Fix, Vec3 } from '../../types';
import { wheelchairRampKit, autoDoorOpener, clearFloorDecal } from './products';

function offset(position: Vec3, dx: number, dy: number, dz: number): Vec3 {
  return [position[0] + dx, position[1] + dy, position[2] + dz];
}

export function fixesFor(issue: Issue): Fix[] {
  switch (issue.issueType) {
    case 'noAccessibleAlternative':
      // ADA §405: ramp placed at the base of the stairs, sloped at max 1:12.
      return [
        {
          issueId: issue.id,
          type: 'wheelchairRamp',
          position: offset(issue.position, 0, 0, 1.2),
          product: wheelchairRampKit,
        },
      ];

    case 'narrowDoorway':
      // ADA §404: widened clearance / automatic opener spanning the doorway.
      return [
        {
          issueId: issue.id,
          type: 'doorWidening',
          position: offset(issue.position, 0, 1.0, 0),
          product: autoDoorOpener,
        },
      ];

    case 'narrowPath':
      // ADA §305/§403: clear-floor-space marking at the obstruction.
      return [
        {
          issueId: issue.id,
          type: 'clearFloorMarking',
          position: offset(issue.position, 0, -0.73, 0),
          product: clearFloorDecal,
        },
      ];

    default:
      return [];
  }
}
