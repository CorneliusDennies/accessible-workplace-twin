import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import { DESIGN_COLORS, LABEL_TEXT, ROUTE_COLOR } from './colors';
import { SpriteLabel } from './SpriteLabel';
import type { Design, Placement } from './types';

const DROP_HEIGHT = 1.6;

// Drops in from above on mount (markers remount whenever the design changes).
function useDropIn(ref: React.RefObject<Group | null>, delay: number) {
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    start.current ??= clock.elapsedTime;
    const t = Math.min(1, Math.max(0, ((clock.elapsedTime - start.current) * 1000 - delay) / 600));
    const ease = 1 - Math.pow(1 - t, 3);
    ref.current.position.y = (1 - ease) * DROP_HEIGHT;
    ref.current.visible = t > 0;
  });
}

function PlacementMarker({ p, index, color }: { p: Placement; index: number; color: string }) {
  const group = useRef<Group>(null);
  useDropIn(group, 150 + index * 180);
  const { w, d, h } = p.size;
  const flat = p.mount === 'floor_flat';

  return (
    <group ref={group}>
      <group position={[p.x, p.y, p.z]}>
        {flat ? (
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w, d]} />
            <meshStandardMaterial color={color} transparent opacity={0.55} />
          </mesh>
        ) : (
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        )}
        <SpriteLabel text={String(index + 1)} color={color} textColor={LABEL_TEXT} position={[0, (flat ? 0 : h) + 0.55, 0]} height={0.62} />
      </group>
    </group>
  );
}

function SeatMarker({ x, z, color }: { x: number; z: number; color: string }) {
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = 1 + 0.25 * Math.sin(clock.elapsedTime * 3);
    ring.current.scale.set(s, s, 1);
  });
  return (
    <group position={[x, 0.02, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.42, 48]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <SpriteLabel text="Seat" color={ROUTE_COLOR} textColor={LABEL_TEXT} position={[0, 0.12, 0.62]} height={0.42} />
    </group>
  );
}

// Hides GLB meshes for furniture the design replaces (the GLB names groups by floorplan id).
function useHideReplaced(ids: string[]) {
  const scene = useThree((s) => s.scene);
  const key = ids.join(',');
  useEffect(() => {
    const hidden = key
      .split(',')
      .filter(Boolean)
      .map((id) => scene.getObjectByName(id))
      .filter((o) => o?.visible);
    hidden.forEach((o) => (o!.visible = false));
    return () => hidden.forEach((o) => (o!.visible = true));
  }, [scene, key]);
}

export function DesignOverlay({ design }: { design: Design }) {
  const { placements, workstation } = design.report;
  useHideReplaced(placements.map((p) => p.replaces_object_id).filter((id): id is string => !!id));
  const color = DESIGN_COLORS[design.id];
  const route = workstation.metrics.route_path.map(([x, z]) => [x, 0.03, z] as [number, number, number]);

  return (
    <group key={design.id}>
      {route.length > 1 && <Line points={route} color={ROUTE_COLOR} lineWidth={2.5} dashed dashSize={0.2} gapSize={0.12} />}
      <SeatMarker x={design.workstation.x} z={design.workstation.z} color={color} />
      {placements.map((p, i) => (
        <PlacementMarker key={`${design.id}-${p.product_id}-${i}`} p={p} index={i} color={color} />
      ))}
    </group>
  );
}
