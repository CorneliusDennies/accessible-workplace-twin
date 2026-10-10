import { Suspense } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import type { OfficeData, Fix } from '../types';
import { OfficeModel } from './OfficeModel';
import { OfficeDataMarkers } from './OfficeDataMarkers';
import { FixMarkers } from './FixMarkers';
import { ScannedOfficeModel } from './ScannedOfficeModel';

export type TagTool = 'door' | 'stairs' | 'obstacle' | 'erase' | null;

interface SceneProps {
  officeData: OfficeData;
  fixes: Fix[];
  showFixes: boolean;
  scannedGlbUrl: string | null;
  tagTool: TagTool;
  onTagPlaced: (x: number, z: number) => void;
  onTagErased: (kind: 'door' | 'obstacle' | 'stairs', id: string) => void;
}

export function Scene({
  officeData,
  fixes,
  showFixes,
  scannedGlbUrl,
  tagTool,
  onTagPlaced,
  onTagErased,
}: SceneProps) {
  function handleModelClick(e: ThreeEvent<MouseEvent>) {
    if (!tagTool || tagTool === 'erase') return;
    e.stopPropagation();
    onTagPlaced(e.point.x, e.point.z);
  }

  return (
    <Canvas camera={{ position: [10, 10, 10], fov: 50 }} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 12, 6]} intensity={1} castShadow />
      <group onClick={handleModelClick}>
        {scannedGlbUrl ? (
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.2}>
              <ScannedOfficeModel glbUrl={scannedGlbUrl} />
            </Bounds>
          </Suspense>
        ) : (
          <OfficeModel officeData={officeData} />
        )}
      </group>
      <OfficeDataMarkers officeData={officeData} eraseMode={tagTool === 'erase'} onErase={onTagErased} />
      {showFixes && <FixMarkers fixes={fixes} />}
      <OrbitControls target={[0, 0, 0]} />
    </Canvas>
  );
}
