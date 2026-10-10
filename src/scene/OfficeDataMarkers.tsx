import type { OfficeData } from '../types';
import { colors } from './sceneConfig';

const STEP_COUNT = 4;

interface OfficeDataMarkersProps {
  officeData: OfficeData;
  eraseMode: boolean;
  onErase?: (kind: 'door' | 'obstacle' | 'stairs', id: string) => void;
}

export function OfficeDataMarkers({ officeData, eraseMode, onErase }: OfficeDataMarkersProps) {
  function eraseHandler(kind: 'door' | 'obstacle' | 'stairs', id: string) {
    return (e: { stopPropagation: () => void }) => {
      if (!eraseMode || !onErase) return;
      e.stopPropagation();
      onErase(kind, id);
    };
  }

  return (
    <group>
      {officeData.doors.map((door) => (
        <mesh
          key={door.id}
          position={[door.position[0], 1, door.position[2]]}
          onClick={eraseHandler('door', door.id)}
        >
          <boxGeometry args={[door.width, 2, 0.1]} />
          <meshStandardMaterial color={colors.door} />
        </mesh>
      ))}

      {officeData.obstacles.map((obstacle) => (
        <mesh key={obstacle.id} position={obstacle.position} onClick={eraseHandler('obstacle', obstacle.id)}>
          <boxGeometry args={obstacle.size} />
          <meshStandardMaterial color={obstacle.hazard ? colors.obstacleHazard : colors.wall} />
        </mesh>
      ))}

      {officeData.stairs.map((stairs) => {
        const [sizeX, , sizeZ] = stairs.size;
        const stepDepth = sizeZ / STEP_COUNT;
        return (
          <group key={stairs.id} onClick={eraseHandler('stairs', stairs.id)}>
            {Array.from({ length: STEP_COUNT }).map((_, i) => {
              const stepHeight = (0.5 * (i + 1)) / STEP_COUNT;
              const z = stairs.position[2] - sizeZ / 2 + stepDepth * (i + 0.5);
              return (
                <mesh key={i} position={[stairs.position[0], stepHeight / 2, z]}>
                  <boxGeometry args={[sizeX, stepHeight, stepDepth]} />
                  <meshStandardMaterial color={colors.stairs} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
