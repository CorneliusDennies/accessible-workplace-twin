import type { OfficeData } from '../types';
import { colors } from './sceneConfig';

interface OfficeModelProps {
  officeData: OfficeData;
}

const STEP_COUNT = 4;

export function OfficeModel({ officeData }: OfficeModelProps) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 14]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>

      {officeData.walls.map((wall) => (
        <mesh key={wall.id} position={wall.position}>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={colors.wall} />
        </mesh>
      ))}

      {officeData.doors.map((door) => (
        <mesh key={door.id} position={[door.position[0], 1, door.position[2]]}>
          <boxGeometry args={[door.width, 2, 0.1]} />
          <meshStandardMaterial color={colors.door} />
        </mesh>
      ))}

      {officeData.obstacles.map((obstacle) => (
        <mesh key={obstacle.id} position={obstacle.position}>
          <boxGeometry args={obstacle.size} />
          <meshStandardMaterial color={obstacle.hazard ? colors.obstacleHazard : colors.wall} />
        </mesh>
      ))}

      {officeData.stairs.map((stairs) => {
        const [sizeX, , sizeZ] = stairs.size;
        const stepDepth = sizeZ / STEP_COUNT;
        return (
          <group key={stairs.id}>
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
