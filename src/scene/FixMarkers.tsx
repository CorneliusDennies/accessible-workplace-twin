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
          default:
            return null;
        }
      })}
    </group>
  );
}
