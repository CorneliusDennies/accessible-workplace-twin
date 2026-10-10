// Scanned spaces put their corner at the origin, in the same frame as their floor plan JSON.
export type Room = { width: number; depth: number };
export const DEMO_SPACE = { glbUrl: '/demo/demo-office.glb', room: { width: 12, depth: 8 } };
