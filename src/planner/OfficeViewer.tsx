import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls, useGLTF, useProgress } from '@react-three/drei';

interface OfficeViewerProps {
  glbUrl: string;
}

function OfficeModel({ glbUrl }: { glbUrl: string }) {
  const { scene } = useGLTF(glbUrl);
  return <primitive object={scene} />;
}

// Plain DOM overlay (outside the Canvas) — drei's <Html> as a Suspense
// fallback throws removeChild errors under React 19 StrictMode.
function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return <div className="viewer-loading">Loading office… {progress.toFixed(0)}%</div>;
}

export function OfficeViewer({ glbUrl }: OfficeViewerProps) {
  return (
    <>
      <Canvas shadows camera={{ position: [-4, 9, 14], fov: 45, near: 0.05, far: 500 }}>
        <color attach="background" args={['#e9edf2']} />
        <hemisphereLight args={['#ffffff', '#b9a98f', 0.9]} />
        <directionalLight
          position={[4, 12, 6]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
        />
        <Suspense fallback={null}>
          <Bounds fit clip margin={1.1}>
            <OfficeModel glbUrl={glbUrl} />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
      <LoadingOverlay />
    </>
  );
}
