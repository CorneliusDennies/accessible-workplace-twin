import type { Product } from '../../types';

// ADA 2010 Standards §705 — Detectable Warnings (tactile warning surfaces at hazards/stairs)
export const tactilePavingTile: Product = {
  sku: 'TPT-01',
  name: 'Tactile Warning Paving Tile',
  unitCost: 45,
  unit: 'per tile',
  estimatedQuantity: 4,
};

// ICC A117.1 §703 — Signage (braille/tactile characters, mounted 48–60in above floor)
export const brailleSign: Product = {
  sku: 'BRL-01',
  name: 'ADA Braille/Tactile Door Sign',
  unitCost: 35,
  unit: 'per sign',
  estimatedQuantity: 1,
};

// ADA §504.4 — Stair treads: contrasting stripe on nose/leading edge
export const contrastStripTape: Product = {
  sku: 'CST-01',
  name: 'High-Contrast Edge Marking Strip',
  unitCost: 12,
  unit: 'per linear meter',
  estimatedQuantity: 2,
};
