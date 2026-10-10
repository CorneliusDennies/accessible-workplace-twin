import type { OfficeData } from '../types';
import { colors } from './sceneConfig';

interface OfficeModelProps {
  officeData: OfficeData;
}

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
    </group>
  );
}
