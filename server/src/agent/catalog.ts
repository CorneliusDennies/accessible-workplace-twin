// Assistive product catalog the planner agent picks from. Costs are rough
// US list-price estimates for planning, not quotes.

export type Need = 'wheelchair' | 'blind' | 'low_vision' | 'deaf' | 'hard_of_hearing';

// floor:      free-standing, occupies floor space (checked for collisions + route width)
// floor_flat: on the floor but walk-over (decals, tactile strips) — not an obstacle
// wall:       mounted on a wall; must be placed within WALL_SNAP of a wall
// desk:       sits on a desk/table; needs target_object_id of a desk or table
// door:       installed on a door; needs target_object_id of a door
export type Mount = 'floor' | 'floor_flat' | 'wall' | 'desk' | 'door';

export interface CatalogProduct {
  id: string;
  name: string;
  serves: Need[];
  mount: Mount;
  footprint?: { w: number; d: number; h: number }; // meters, floor / floor_flat only
  mountHeight?: number; // meters, wall only
  replaces?: string[]; // floor items that can replace an existing object of these types
  unitCost: number;
  description: string;
  placement: string; // guidance the agent should follow
  standard?: string;
  // Google Shopping query for real listings. A listing counts only if its price is
  // >= minPrice and its title contains one of `any` and none of `none` (drops accessories and lookalikes).
  search: { q: string; minPrice: number; any: string[]; none: string[] };
}

export const WALL_SNAP = 0.35;

export const catalog: CatalogProduct[] = [
  // --- Mobility / wheelchair ---
  {
    id: 'sit-stand-desk',
    search: { q: 'electric height adjustable standing desk 60 inch', minPrice: 150, any: ['desk'], none: ['converter', 'riser', 'frame only', 'mat', 'keyboard tray', 'monitor'] },
    name: 'Electric height-adjustable desk (65–125 cm)',
    serves: ['wheelchair'],
    mount: 'floor',
    footprint: { w: 1.6, d: 0.8, h: 0.75 },
    replaces: ['desk'],
    unitCost: 650,
    description: 'Motorized desk that lowers to wheelchair height with open knee clearance.',
    placement: 'Replace an existing desk or add a new one. Needs a 60in turning circle beside it and a 36in route from the entrance.',
    standard: 'ADA §902.3 work surface 28–34in, §902.2 knee clearance',
  },
  {
    id: 'low-reach-storage',
    search: { q: 'mobile file cabinet pedestal 3 drawer rolling', minPrice: 60, any: ['cabinet', 'pedestal', 'drawer'], none: [] },
    name: 'Low-reach rolling storage pedestal',
    serves: ['wheelchair'],
    mount: 'floor',
    footprint: { w: 0.5, d: 0.6, h: 0.7 },
    unitCost: 320,
    description: 'Drawer pedestal with every shelf inside the 15–48in reach range.',
    placement: 'Next to the workstation, within arm reach, without blocking the turning circle.',
    standard: 'ADA §308.2.1 forward reach 15–48in',
  },
  {
    id: 'pull-down-shelf-lift',
    search: { q: 'pull down shelf lift system upper cabinet', minPrice: 80, any: ['pull down', 'pull-down', 'pulldown', 'shelf lift', 'lift'], none: [] },
    name: 'Motorized pull-down shelf lift',
    serves: ['wheelchair'],
    mount: 'wall',
    mountHeight: 1.4,
    unitCost: 900,
    description: 'Retrofits a high shelf so its contents lower to seated reach height at the press of a button.',
    placement: 'On the wall at an existing high shelf (top above 48in).',
    standard: 'ADA §308.2.1 forward reach 48in max',
  },
  {
    id: 'auto-door-opener',
    search: { q: 'automatic swing door opener operator commercial ADA', minPrice: 250, any: ['opener', 'operator'], none: ['garage', 'gate', 'switch only', 'remote only', 'sensor only'] },
    name: 'Automatic door operator with wave sensor',
    serves: ['wheelchair', 'blind', 'low_vision'],
    mount: 'door',
    unitCost: 1800,
    description: 'Low-energy door operator opened by a touchless wave plate.',
    placement: 'On the main entrance door. target_object_id must be the door.',
    standard: 'ADA §404.3 automatic doors',
  },
  {
    id: 'accessible-counter',
    search: { q: 'ADA compliant wheelchair accessible sink base cabinet', minPrice: 300, any: ['ada', 'accessible', 'wheelchair'], none: [] },
    name: 'Lowered kitchenette counter section with knee space',
    serves: ['wheelchair'],
    mount: 'floor',
    footprint: { w: 0.9, d: 0.6, h: 0.86 },
    unitCost: 2400,
    description: '34in-high counter section with open knee clearance and a front-reach faucet.',
    placement: 'Beside the existing kitchenette counter, with a 36in route to it.',
    standard: 'ADA §902.3 / §606 sinks',
  },
  {
    id: 'route-floor-marking',
    search: { q: 'ADA floor marking tape 4 inch heavy duty aisle', minPrice: 15, any: ['floor', 'tape', 'marking'], none: [] },
    name: 'Clear-route floor marking (36in lane)',
    serves: ['wheelchair', 'low_vision'],
    mount: 'floor_flat',
    footprint: { w: 0.915, d: 3.0, h: 0.005 },
    unitCost: 90,
    description: 'Durable floor decal that marks a 36in lane that must stay furniture-free.',
    placement: 'Along the route between the entrance and the workstation. Rotate 90 to run along x.',
    standard: 'ADA §403.5.1 clear width 36in',
  },

  // --- Deaf / hard of hearing ---
  {
    id: 'visual-fire-strobe',
    search: { q: 'fire alarm horn strobe wall mount red', minPrice: 30, any: ['strobe'], none: ['cover', 'guard', 'bracket', 'plate', 'damper', 'cage', 'sign'] },
    name: 'Visual fire alarm strobe',
    serves: ['deaf', 'hard_of_hearing'],
    mount: 'wall',
    mountHeight: 2.1,
    unitCost: 250,
    description: 'Strobe tied to the building fire alarm so alerts are visible, not only audible.',
    placement: 'On a wall in direct line of sight of the workstation, near the existing audible alarm.',
    standard: 'ADA §702.1 fire alarm systems (NFPA 72 visible notification)',
  },
  {
    id: 'flashing-doorbell',
    search: { q: 'flashing doorbell for deaf visual signaler', minPrice: 25, any: ['flash', 'strobe', 'light'], none: [] },
    name: 'Flashing doorbell / visitor signaler',
    serves: ['deaf', 'hard_of_hearing'],
    mount: 'wall',
    mountHeight: 1.5,
    unitCost: 120,
    description: 'Light signaler that flashes when the doorbell is pressed.',
    placement: 'On a wall visible from the workstation; pairs with the existing doorbell.',
  },
  {
    id: 'vibrating-alert-pager',
    search: { q: 'deaf alert system vibrating pager receiver bed shaker', minPrice: 60, any: ['vibrat', 'pager', 'shaker'], none: [] },
    name: 'Wearable vibrating alert receiver + desk base',
    serves: ['deaf', 'hard_of_hearing'],
    mount: 'desk',
    unitCost: 350,
    description: 'Wrist pager that vibrates for fire alarm, doorbell, and name calls; charges on the desk.',
    placement: 'On the workstation desk. target_object_id must be the desk.',
  },
  {
    id: 'hearing-loop',
    search: { q: 'induction hearing loop system amplifier room', minPrice: 150, any: ['loop'], none: ['cable only', 'tester', 'receiver', 'body pack', 'neckloop', 'neck loop'] },
    name: 'Meeting-table hearing loop',
    serves: ['hard_of_hearing'],
    mount: 'desk',
    unitCost: 1500,
    description: 'Induction loop that streams meeting audio directly to hearing aids.',
    placement: 'On the meeting table. target_object_id must be the table.',
    standard: 'ADA §219 / §706 assistive listening systems',
  },
  {
    id: 'live-caption-display',
    search: { q: 'real time captioning device deaf speech to text display', minPrice: 80, any: ['caption', 'transcri', 'speech to text', 'speech-to-text', 'subtitle'], none: [] },
    name: 'Live-captioning display',
    serves: ['deaf', 'hard_of_hearing'],
    mount: 'wall',
    mountHeight: 1.4,
    unitCost: 700,
    description: 'Wall screen showing real-time speech-to-text captions during meetings.',
    placement: 'On the wall nearest the meeting table, visible from every seat.',
  },

  // --- Blind / low vision ---
  {
    id: 'tactile-guide-strip',
    search: { q: 'tactile warning strip detectable indoor truncated dome', minPrice: 20, any: ['tactile', 'detectable', 'truncated'], none: ['trim', 'lever', 'lockset', 'door'] },
    name: 'Indoor tactile guidance strip (3m)',
    serves: ['blind'],
    mount: 'floor_flat',
    footprint: { w: 0.3, d: 3.0, h: 0.005 },
    unitCost: 120,
    description: 'Raised-rib walking surface indicator that a cane can follow from the entrance.',
    placement: 'Along the walking route from the entrance toward the workstation, kept clear of furniture. Rotate 90 to run along x.',
    standard: 'Best practice (ISO 23599); not an ADA requirement indoors',
  },
  {
    id: 'braille-room-sign',
    search: { q: 'ADA braille office room sign', minPrice: 20, any: ['braille'], none: [] },
    name: 'Tactile + braille room sign',
    serves: ['blind', 'low_vision'],
    mount: 'wall',
    mountHeight: 1.5,
    unitCost: 80,
    description: 'Raised characters and Grade 2 braille identifying the room.',
    placement: 'On the latch side wall of the entrance door.',
    standard: 'ADA §703.2–703.4 (baseline 48–60in above floor)',
  },
  {
    id: 'audio-beacon',
    search: { q: 'bluetooth BLE beacon indoor wayfinding ibeacon', minPrice: 15, any: ['beacon'], none: [] },
    name: 'BLE audio wayfinding beacon',
    serves: ['blind', 'low_vision'],
    mount: 'wall',
    mountHeight: 2.0,
    unitCost: 150,
    description: 'Bluetooth beacon that announces landmarks to a phone screen reader.',
    placement: 'On walls at decision points: entrance, workstation, kitchenette, meeting table.',
  },
  {
    id: 'contrast-edge-kit',
    search: { q: 'high contrast safety edge tape yellow anti slip', minPrice: 8, any: ['tape', 'edge'], none: [] },
    name: 'High-contrast edge marking kit',
    serves: ['low_vision'],
    mount: 'desk',
    unitCost: 60,
    description: 'High-contrast tape for desk and table edges.',
    placement: 'On the workstation desk or meeting table edges.',
  },
  {
    id: 'screen-reader-station',
    search: { q: 'refreshable braille display 40 cell', minPrice: 400, any: ['braille'], none: ['cover', 'case', 'bag'] },
    name: 'Screen reader + 40-cell refreshable braille display kit',
    serves: ['blind'],
    mount: 'desk',
    unitCost: 3200,
    description: 'Screen reader license, refreshable braille display, and tactile keyboard overlay.',
    placement: 'On the workstation desk.',
  },
  {
    id: 'adjustable-task-light',
    search: { q: 'LED desk lamp adjustable color temperature dimmable', minPrice: 15, any: ['lamp', 'light'], none: ['bulb'] },
    name: 'Glare-free adjustable task light',
    serves: ['low_vision'],
    mount: 'desk',
    unitCost: 140,
    description: 'Dimmable task lamp with adjustable color temperature.',
    placement: 'On the workstation desk.',
  },

  // --- Innovative / tech-forward options ---
  {
    id: 'ai-smart-glasses',
    search: { q: 'AI smart glasses for blind and visually impaired', minPrice: 150, any: ['glasses'], none: ['case', 'lens', 'cleaning', 'strap', 'reading glasses'] },
    name: 'AI smart glasses that describe surroundings',
    serves: ['blind', 'low_vision'],
    mount: 'desk',
    unitCost: 600,
    description: 'Camera glasses that read text aloud, recognize colleagues, and describe the room on request.',
    placement: 'Personal device docked and charged at the workstation desk. target_object_id must be the desk.',
  },
  {
    id: 'smart-cane',
    search: { q: 'smart cane for blind obstacle detection navigation', minPrice: 100, any: ['cane'], none: ['tip', 'holder', 'replacement'] },
    name: 'Smart cane with obstacle detection + navigation',
    serves: ['blind'],
    mount: 'desk',
    unitCost: 850,
    description: 'White cane that vibrates for head-height obstacles and gives turn-by-turn directions.',
    placement: 'Personal device; charging spot at the workstation desk. target_object_id must be the desk.',
  },
  {
    id: 'video-magnifier',
    search: { q: 'desktop electronic video magnifier low vision', minPrice: 300, any: ['magnifier'], none: ['handheld', 'pocket', 'glass', 'lamp'] },
    name: 'Desktop electronic video magnifier',
    serves: ['low_vision'],
    mount: 'desk',
    unitCost: 1800,
    description: 'Camera-and-screen magnifier for paper documents, up to ~60x with high-contrast color modes.',
    placement: 'On the workstation desk. target_object_id must be the desk.',
  },
  {
    id: 'wireless-meeting-mic',
    search: { q: 'Phonak Roger On microphone hearing aids', minPrice: 200, any: ['roger', 'microphone', 'mic'], none: ['cover', 'case', 'charger only'] },
    name: 'Wireless meeting microphone that streams to hearing aids',
    serves: ['hard_of_hearing'],
    mount: 'desk',
    unitCost: 1200,
    description: 'Table microphone that picks up whoever is talking and streams it straight into hearing aids or cochlear implants.',
    placement: 'On the meeting table. target_object_id must be the table.',
    standard: 'ADA §219 / §706 assistive listening systems',
  },
  {
    id: 'sound-alert-light',
    search: { q: 'sound activated alert light for deaf doorbell smoke alarm', minPrice: 30, any: ['alert', 'light', 'flash', 'strobe'], none: ['bulb only', 'replacement'] },
    name: 'Sound-recognition alert light',
    serves: ['deaf', 'hard_of_hearing'],
    mount: 'wall',
    mountHeight: 1.8,
    unitCost: 120,
    description: 'Listens for the fire alarm, doorbell, and phone and flashes a distinct light pattern for each.',
    placement: 'On a wall in direct view of the workstation.',
  },
  {
    id: 'auto-sliding-door',
    search: { q: 'automatic sliding door opener kit commercial', minPrice: 300, any: ['sliding'], none: ['garage', 'gate', 'closet', 'barn', 'pet'] },
    name: 'Automatic sliding door system',
    serves: ['wheelchair', 'blind', 'low_vision'],
    mount: 'door',
    unitCost: 2500,
    description: 'Motorized sliding door that opens on approach: no swing to wait out and no handle to find.',
    placement: 'Replaces a swing door that is a bottleneck. target_object_id must be the door.',
    standard: 'ADA §404.3 automatic doors',
  },
  {
    id: 'motorized-monitor-arm',
    search: { q: 'motorized height adjustable monitor arm electric', minPrice: 80, any: ['monitor'], none: ['cable', 'screen protector'] },
    name: 'Motorized monitor arm',
    serves: ['wheelchair', 'low_vision'],
    mount: 'desk',
    unitCost: 350,
    description: 'Moves the screen up, down, and closer at the press of a button to match seated eye height and viewing distance.',
    placement: 'On the workstation desk. target_object_id must be the desk.',
  },
  {
    id: 'tactile-floor-map',
    search: { q: 'tactile braille floor plan map sign ADA', minPrice: 100, any: ['tactile', 'braille'], none: [] },
    name: 'Tactile + braille floor map',
    serves: ['blind', 'low_vision'],
    mount: 'wall',
    mountHeight: 1.2,
    unitCost: 450,
    description: 'Raised-line map of the floor with braille labels, so a blind visitor can learn the layout by touch.',
    placement: 'On the wall just inside the entrance.',
    standard: 'ADA §703 tactile characters (best practice for maps)',
  },
  {
    id: 'motorized-counter-lift',
    search: { q: 'motorized height adjustable kitchen counter lift', minPrice: 500, any: ['adjustable', 'lift'], none: ['bar stool', 'chair', 'desk frame'] },
    name: 'Motorized height-adjustable kitchen counter',
    serves: ['wheelchair'],
    mount: 'floor',
    footprint: { w: 1.2, d: 0.6, h: 0.9 },
    unitCost: 3500,
    description: 'Counter section that lowers to seated height with a button, so everyone can use the same kitchen.',
    placement: 'Beside the existing kitchen counter, with a 36in route to it.',
    standard: 'ADA §902.3 / §606',
  },
];

// Cheapest real listing price per product, filled in by shopping.ts when a shopping API is configured.
export const livePrices = new Map<string, number>();

/** Catalog entry with its live price (when known) in place of the estimate. */
export function getProduct(id: string): CatalogProduct | undefined {
  const p = catalog.find((c) => c.id === id);
  if (!p) return undefined;
  const live = livePrices.get(id);
  return live === undefined ? p : { ...p, unitCost: live };
}

export function pricedCatalog(): (CatalogProduct & { price_source: 'live' | 'estimate' })[] {
  return catalog.map((p) => ({ ...getProduct(p.id)!, price_source: livePrices.has(p.id) ? 'live' : 'estimate' }));
}
