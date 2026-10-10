import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import type { OfficeData, Fix } from '../types';
import { OfficeModel } from './OfficeModel';
import { FixMarkers } from './FixMarkers';
import { ScannedOfficeModel } from './ScannedOfficeModel';

interface SceneProps {
  officeData: OfficeData;
  fixes: Fix[];
  showFixes: boolean;
  scannedGlbUrl: string | null;
}

export function Scene({ officeData, fixes, showFixes, scannedGlbUrl }: SceneProps) {
  return (
    <Canvas camera={{ position: [10, 10, 10], fov: 50 }} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 12, 6]} intensity={1} castShadow />
      {scannedGlbUrl ? (
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            <ScannedOfficeModel glbUrl={scannedGlbUrl} />
          </Bounds>
        </Suspense>
      ) : (
        <OfficeModel officeData={officeData} />
      )}
      {showFixes && <FixMarkers fixes={fixes} />}
      <OrbitControls target={[0, 0, 0]} />
    </Canvas>
  );
}
