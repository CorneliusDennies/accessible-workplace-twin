// Mirrors the planner API (server/src/agent) response shapes.

export type Need = 'wheelchair' | 'blind' | 'low_vision' | 'deaf' | 'hard_of_hearing';
export type Mount = 'floor' | 'floor_flat' | 'wall' | 'desk' | 'door';

export interface Placement {
  product_id: string;
  product_name: string;
  mount: Mount;
  unit_cost: number;
  x: number;
  y: number;
  z: number;
  rotation_deg: 0 | 90;
  size: { w: number; d: number; h: number };
  target_object_id: string | null;
  replaces_object_id: string | null;
  reason: string;
}

export interface Design {
  id: 'A' | 'B' | 'C';
  name: string;
  tagline: string;
  workstation: { x: number; z: number };
  pros: string[];
  cons: string[];
  best_for: string[];
  report: {
    total_cost: number;
    placements: Placement[];
    workstation: {
      metrics: {
        route_from_entrance_m: number | null;
        turning_space: boolean;
        desk_id: string | null;
        walk_to_m: Record<string, number | null>;
        route_path: [number, number][];
      };
    };
  };
}

export interface Listing {
  title: string;
  store: string;
  price: number;
  price_text: string;
  link: string;
  thumbnail: string | null;
  rating: number | null;
  reviews: number | null;
  delivery: string | null;
}

export interface ProductListings {
  product_id: string;
  query: string;
  fetched_at: string;
  listings: Listing[]; // cheapest first
}

export interface PlanResult {
  problem: string;
  scan?: { id: string; name: string; glbUrl: string; room: { width: number; depth: number } } | null;
  needs: Need[];
  summary: string;
  designs: Design[];
  model: string;
  products?: Record<string, ProductListings> | null; // real listings; null/absent = prices are estimates
  created_at: string;
}

export type AgentEvent =
  | { type: 'tool'; name: string; summary: string; ok: boolean }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string };
