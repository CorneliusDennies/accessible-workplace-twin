import type { Issue, Fix, Vec3 } from '../../types';
import { tactilePavingTile, brailleSign, contrastStripTape } from './products';

function offset(position: Vec3, dx: number, dy: number, dz: number): Vec3 {
  return [position[0] + dx, position[1] + dy, position[2] + dz];
}

export function fixesFor(issue: Issue): Fix[] {
  switch (issue.issueType) {
    case 'missingTactileWarning':
      // ADA §705: detectable warning surface placed ~0.3m from the stair edge.
      return [
        {
          issueId: issue.id,
          type: 'tactilePaving',
          position: offset(issue.position, 0, 0.02, 0.3),
          product: tactilePavingTile,
        },
      ];

    case 'missingSignage':
      // ICC A117.1 §703: mounted at ~1.2m (48in) height beside the door.
      return [
        {
          issueId: issue.id,
          type: 'brailleSignage',
          position: offset(issue.position, 0.6, 1.2, 0),
          product: brailleSign,
        },
      ];

    case 'missingContrastStrip':
      return [
        {
          issueId: issue.id,
          type: 'contrastStrip',
          position: offset(issue.position, 0, 0.03, 0),
          product: contrastStripTape,
        },
      ];

    default:
      return [];
  }
}
