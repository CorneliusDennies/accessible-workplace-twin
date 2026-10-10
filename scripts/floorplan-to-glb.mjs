// Turns a floor plan JSON into a clean, boxy 3D office (GLB).
//
//   node scripts/floorplan-to-glb.mjs [floorplan.json] [out.glb]
//
// Defaults: data/demo-floorplan.json -> public/demo/demo-office.glb.
// Coordinates follow the floor plan: meters, x across (0..width), z into the
// room (0..depth), y up, object x/z = footprint centre. Doors/windows sit on
// whichever wall they're nearest to.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter expects the browser FileReader; Node only has Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend();
    });
  }
};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [inArg, outArg] = process.argv.slice(2);
const inPath = path.resolve(inArg ?? path.join(root, 'data/demo-floorplan.json'));
const outPath = path.resolve(outArg ?? path.join(root, 'public/demo/demo-office.glb'));
const plan = JSON.parse(fs.readFileSync(inPath, 'utf8'));

const mat = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const M = {
  floor: mat('#c9b79c'),
  wall: mat('#eceae4', 0.95),
  wood: mat('#a87b51', 0.6),
  metal: mat('#55595f', 0.4),
  chair: mat('#2f3a4a'),
  sofa: mat('#6b7280'),
  shelf: mat('#d9d4cc'),
  cabinet: mat('#b9a58a'),
  alert: mat('#d83a2e', 0.5),
  counter: mat('#f4f2ee', 0.5),
  frame: mat('#6b5a48'),
  glass: mat('#9cc3e6', 0.1, { transparent: true, opacity: 0.45 }),
  generic: mat('#9aa3ad'),
};

const office = new THREE.Group();
office.name = 'office';

// Adds a box with its BOTTOM at y0 (easier to reason about heights).
function box(name, material, x, y0, z, w, h, d, parent = office) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y0 + h / 2, z);
  parent.add(mesh);
  return mesh;
}

const { width: W, depth: D, wall_height: H = 2.8 } = plan.room;
const T = 0.15;
const DOOR_H = 2.1;

// Floor: one slab, plus a faint per-room tint when the plan lists rooms.
box('floor', M.floor, W / 2, -0.05, D / 2, W, 0.05, D);
const ROOM_TINTS = ['#cbb89c', '#c4b49b', '#cfc0a6', '#c2b297', '#c9bba3'];
(plan.rooms ?? []).forEach((r, i) => {
  box(`floor_${r.id}`, mat(ROOM_TINTS[i % ROOM_TINTS.length]), (r.x0 + r.x1) / 2, -0.04, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.02, 0.045, r.z1 - r.z0 - 0.02);
});

// Every wall is an axis-aligned segment: `axis` is the direction it runs,
// `line` the coordinate it sits on, a0..a1 its extent. Openings (doors,
// windows) cut gaps in whichever wall they sit on.
const walls = [
  { name: 'north', axis: 'x', line: 0, offset: -T / 2, a0: -T, a1: W + T },
  { name: 'south', axis: 'x', line: D, offset: T / 2, a0: -T, a1: W + T },
  { name: 'west', axis: 'z', line: 0, offset: -T / 2, a0: 0, a1: D },
  { name: 'east', axis: 'z', line: W, offset: T / 2, a0: 0, a1: D },
  ...(plan.walls ?? []).map((w) => {
    const axis = Math.abs(w.x1 - w.x0) >= Math.abs(w.z1 - w.z0) ? 'x' : 'z';
    const [a0, a1] = axis === 'x' ? [Math.min(w.x0, w.x1), Math.max(w.x0, w.x1)] : [Math.min(w.z0, w.z1), Math.max(w.z0, w.z1)];
    return { name: w.id, axis, line: axis === 'x' ? w.z0 : w.x0, offset: 0, a0, a1, thickness: w.thickness ?? 0.1 };
  }),
];
for (const w of walls) w.fixed = w.line + w.offset;

// Distance from an object to a wall segment (Infinity if it's past the ends).
function distToWall(o, w) {
  const along = w.axis === 'x' ? o.x : o.z;
  const across = w.axis === 'x' ? o.z : o.x;
  if (along < w.a0 - 0.05 || along > w.a1 + 0.05) return Infinity;
  return Math.abs(across - w.line);
}
const openings = plan.objects.filter((o) => o.type === 'door' || o.type === 'window');
const wallOf = (o) => walls.reduce((best, w) => (distToWall(o, w) < distToWall(o, best) ? w : best));

function wallBox(wall, name, material, a0, a1, y0, h, thickness = wall.thickness ?? T) {
  const mid = (a0 + a1) / 2;
  const len = a1 - a0;
  if (len <= 0.001) return;
  if (wall.axis === 'x') box(name, material, mid, y0, wall.fixed, len, h, thickness);
  else box(name, material, wall.fixed, y0, mid, thickness, h, len);
}

for (const wall of walls) {
  const holes = openings
    .filter((o) => wallOf(o) === wall)
    .map((o) => {
      const along = wall.axis === 'x' ? o.x : o.z;
      const half = (o.width ?? 0.9) / 2;
      return { o, a0: along - half, a1: along + half };
    })
    .sort((a, b) => a.a0 - b.a0);

  const thick = (wall.thickness ?? T) + 0.02;
  let cursor = wall.a0;
  for (const { o, a0, a1 } of holes) {
    wallBox(wall, `wall_${wall.name}`, M.wall, cursor, a0, 0, H);
    if (o.type === 'door') {
      wallBox(wall, `${o.id}_header`, M.wall, a0, a1, DOOR_H, H - DOOR_H);
      wallBox(wall, `${o.id}_frame`, M.frame, a0 - 0.06, a0, 0, DOOR_H, thick);
      wallBox(wall, `${o.id}_frame`, M.frame, a1, a1 + 0.06, 0, DOOR_H, thick);
    } else {
      const sill = o.sill ?? 0.9;
      const top = Math.min(o.height ?? 2.1, H - 0.1);
      wallBox(wall, `${o.id}_sill`, M.wall, a0, a1, 0, sill);
      wallBox(wall, `${o.id}_glass`, M.glass, a0, a1, sill, top - sill, 0.03);
      wallBox(wall, `${o.id}_header`, M.wall, a0, a1, top, H - top);
    }
    cursor = a1;
  }
  wallBox(wall, `wall_${wall.name}`, M.wall, cursor, wall.a1, 0, H);
}

function chair(name, x, z, facing, parent) {
  // facing: +1 = back toward +z, -1 = back toward -z
  box(`${name}_seat`, M.chair, x, 0.42, z, 0.46, 0.06, 0.46, parent);
  box(`${name}_back`, M.chair, x, 0.48, z + facing * 0.21, 0.46, 0.45, 0.05, parent);
  box(`${name}_post`, M.metal, x, 0, z, 0.06, 0.42, 0.06, parent);
}

for (const o of plan.objects) {
  if (o.type === 'door' || o.type === 'window') continue;
  const g = new THREE.Group();
  g.name = o.id;
  office.add(g);
  const w = o.w ?? 0.5;
  const d = o.d ?? 0.5;

  switch (o.type) {
    case 'desk':
    case 'table': {
      const top = o.height ?? 0.75;
      box(`${o.id}_top`, M.wood, o.x, top - 0.04, o.z, w, 0.04, d, g);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(`${o.id}_leg`, M.metal, o.x + sx * (w / 2 - 0.06), 0, o.z + sz * (d / 2 - 0.06), 0.05, top - 0.04, 0.05, g);
        }
      }
      if (top < 0.6) break; // coffee table — no chairs
      const side = o.z < D / 2 ? 1 : -1;
      const seats = o.type === 'desk' ? [[0, side]] : [[-0.25, 1], [0.25, -1]];
      for (const [dx, s] of seats) {
        chair(`${o.id}_chair`, o.x + dx * w, o.z + s * (d / 2 + 0.33), s, g);
      }
      break;
    }
    case 'chair':
      chair(o.id, o.x, o.z, o.z < D / 2 ? -1 : 1, g);
      break;
    case 'sofa': {
      const h = o.height ?? 0.85;
      const backToward = o.z < D / 2 ? -1 : 1;
      box(`${o.id}_seat`, M.sofa, o.x, 0, o.z, w, 0.45, d, g);
      box(`${o.id}_back`, M.sofa, o.x, 0.45, o.z + backToward * (d / 2 - 0.1), w, h - 0.45, 0.2, g);
      for (const sx of [-1, 1]) box(`${o.id}_arm`, M.sofa, o.x + sx * (w / 2 - 0.1), 0.45, o.z, 0.2, 0.2, d, g);
      break;
    }
    case 'bed': {
      const h = o.height ?? 0.55;
      box(`${o.id}_frame`, M.wood, o.x, 0, o.z, w, h - 0.2, d, g);
      box(`${o.id}_mattress`, M.counter, o.x, h - 0.2, o.z, w - 0.04, 0.2, d - 0.04, g);
      break;
    }
    case 'shelf':
      box(`${o.id}_body`, M.shelf, o.x, 0, o.z, w, o.top_height ?? 1.8, d, g);
      break;
    case 'counter':
      box(`${o.id}_body`, M.counter, o.x, 0, o.z, w, o.height ?? 0.9, d, g);
      break;
    case 'cabinet':
      box(`${o.id}_body`, M.cabinet, o.x, 0, o.z, w, o.height ?? o.top_height ?? 0.9, d, g);
      break;
    case 'audio_alert': {
      // Small red box flush against the nearest wall.
      const wall = wallOf(o);
      const alongX = wall.axis === 'x';
      box(`${o.id}_body`, M.alert, o.x, (o.height ?? 2.2) - 0.08, o.z, alongX ? 0.16 : 0.08, 0.16, alongX ? 0.08 : 0.16, g);
      break;
    }
    default:
      // Unknown type (coat_rack, pillar, …): plain box so it still shows up.
      box(`${o.id}_body`, M.generic, o.x, 0, o.z, w, o.height ?? o.top_height ?? 1.0, d, g);
  }
}

office.traverse((obj) => {
  if (obj.isMesh) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
});

new GLTFExporter().parse(
  office,
  (glb) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(glb));
    console.log(`Wrote ${path.relative(root, outPath)} (${(glb.byteLength / 1024).toFixed(1)} KB)`);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
  { binary: true }
);
