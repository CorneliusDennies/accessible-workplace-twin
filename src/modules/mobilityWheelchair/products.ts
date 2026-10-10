import type { Product } from '../../types';

// ADA 2010 Standards §405 — Ramps (max slope 1:12, with landings top & bottom)
export const wheelchairRampKit: Product = {
  sku: 'RMP-01',
  name: 'Modular Portable Wheelchair Ramp Kit',
  unitCost: 650,
  unit: 'per ramp run',
  estimatedQuantity: 1,
};

// ADA 2010 Standards §404 — Doors, Doorways & Gates (min 32in / 0.813m clear width)
export const autoDoorOpener: Product = {
  sku: 'ADO-01',
  name: 'Automatic Door Opener + Widened Clearance Hardware',
  unitCost: 1200,
  unit: 'per door',
  estimatedQuantity: 1,
};

// ADA 2010 Standards §305 / §403 — Clear Floor Space & Walking Surfaces (min 36in / 0.914m clear width)
export const clearFloorDecal: Product = {
  sku: 'CFD-01',
  name: 'Clear Floor Space Marking Decal + Furniture Relocation',
  unitCost: 85,
  unit: 'per marking',
  estimatedQuantity: 1,
};
