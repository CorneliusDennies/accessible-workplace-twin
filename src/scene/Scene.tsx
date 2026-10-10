import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OfficeData, Fix } from '../types';
import { OfficeModel } from './OfficeModel';
import { FixMarkers } from './FixMarkers';

interface SceneProps {
  officeData: OfficeData;
  fixes: Fix[];
  showFixes: boolean;
}

export function Scene({ officeData, fixes, showFixes }: SceneProps) {
  return (
    <Canvas camera={{ position: [10, 10, 10], fov: 50 }} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 12, 6]} intensity={1} castShadow />
      <OfficeModel officeData={officeData} />
      {showFixes && <FixMarkers fixes={fixes} />}
      <OrbitControls target={[0, 0, 0]} />
    </Canvas>
  );
}
