import type { OfficeData, Issue } from '../../types';

const MODULE_ID = 'blindLowVision';

export function analyze(officeData: OfficeData): Issue[] {
  const issues: Issue[] = [];

  for (const stairs of officeData.stairs) {
    issues.push({
      id: `issue-${stairs.id}-tactile`,
      moduleId: MODULE_ID,
      issueType: 'missingTactileWarning',
      severity: 'high',
      locationId: stairs.id,
      position: stairs.position,
      description: `No detectable warning surface at the top of stairs "${stairs.id}".`,
      standardReference: 'ADA 2010 Standards §705 — Detectable Warnings',
    });

    issues.push({
      id: `issue-${stairs.id}-contrast`,
      moduleId: MODULE_ID,
      issueType: 'missingContrastStrip',
      severity: 'medium',
      locationId: stairs.id,
      position: stairs.position,
      description: `No contrasting stripe on the leading edge of stairs "${stairs.id}".`,
      standardReference: 'ADA 2010 Standards §504.4 — Stair Treads',
    });
  }

  for (const door of officeData.doors) {
    issues.push({
      id: `issue-${door.id}-signage`,
      moduleId: MODULE_ID,
      issueType: 'missingSignage',
      severity: 'medium',
      locationId: door.id,
      position: door.position,
      description: `No braille/tactile signage at door "${door.id}".`,
      standardReference: 'ICC A117.1 §703 — Signage',
    });
  }

  for (const obstacle of officeData.obstacles) {
    if (!obstacle.hazard) continue;
    issues.push({
      id: `issue-${obstacle.id}-contrast`,
      moduleId: MODULE_ID,
      issueType: 'missingContrastStrip',
      severity: 'low',
      locationId: obstacle.id,
      position: obstacle.position,
      description: `Protruding obstacle "${obstacle.id}" lacks a detectable/contrasting warning marker.`,
      standardReference: 'ADA 2010 Standards §504.4 — Contrast Marking',
    });
  }

  return issues;
}
