import type { Fix } from '../types';
import { colors } from './sceneConfig';

interface FixMarkersProps {
  fixes: Fix[];
}

export function FixMarkers({ fixes }: FixMarkersProps) {
  return (
    <group>
      {fixes.map((fix, i) => {
        switch (fix.type) {
          case 'tactilePaving':
            return (
              <mesh key={i} position={fix.position}>
                <boxGeometry args={[1.2, 0.04, 0.6]} />
                <meshStandardMaterial color={colors.tactilePaving} />
              </mesh>
            );
          case 'brailleSignage':
            return (
              <mesh key={i} position={fix.position}>
                <boxGeometry args={[0.2, 0.3, 0.05]} />
                <meshStandardMaterial color={colors.brailleSignage} />
              </mesh>
            );
          case 'contrastStrip':
            return (
              <mesh key={i} position={fix.position}>
                <boxGeometry args={[1.2, 0.02, 0.1]} />
                <meshStandardMaterial color={colors.contrastStrip} />
              </mesh>
            );
          case 'wheelchairRamp':
            // Low, wide wedge-like box approximating a sloped ramp run.
            return (
              <mesh key={i} position={fix.position} rotation={[-0.3, 0, 0]}>
                <boxGeometry args={[2.2, 0.1, 2.4]} />
                <meshStandardMaterial color={colors.wheelchairRamp} />
              </mesh>
            );
          case 'doorWidening':
            // Wide pale marker spanning the doorway opening.
            return (
              <mesh key={i} position={fix.position}>
                <boxGeometry args={[1.4, 0.1, 0.05]} />
                <meshStandardMaterial color={colors.doorWidening} />
              </mesh>
            );
          case 'clearFloorMarking':
            // Flat marking on the floor where the obstacle narrows the route.
            return (
              <mesh key={i} position={fix.position} rotation={[-Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.9, 0.9, 0.02, 32]} />
                <meshStandardMaterial color={colors.clearFloorMarking} />
              </mesh>
            );
          default:
            return null;
        }
      })}
    </group>
  );
}
