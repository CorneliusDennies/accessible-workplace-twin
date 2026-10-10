import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import { BufferGeometry, EdgesGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial } from 'three';
import { DesignOverlay } from '../planner/agent/DesignOverlay';
import type { Design } from '../planner/agent/types';

import { DEMO_SPACE, type Room } from './spaces';

const FLOOR = new MeshStandardMaterial({ color: '#eef2f7', roughness: 1 });
const SOLID = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
const WALL = new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false });
const EDGE = new LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.75 });
const WALL_EDGE = new LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.7 });

// Clean model render of the scanned office: light solids with soft gray outlines.
function Office({ glbUrl }: { glbUrl: string }) {
  const { scene } = useGLTF(glbUrl);
  const office = useMemo(() => {
    const clone = scene.clone(true);
    const meshes: Mesh[] = [];
    clone.traverse((obj) => {
      if (obj instanceof Mesh) meshes.push(obj);
    });
    for (const mesh of meshes) {
      const isFloor = mesh.name === 'floor';
      const isWall = mesh.name.startsWith('wall') || mesh.name.includes('header') || mesh.name.includes('frame');
      mesh.material = isFloor ? FLOOR : isWall ? WALL : SOLID;
      mesh.receiveShadow = true;
      mesh.castShadow = !isFloor && !isWall;
      if (!isFloor) mesh.add(new LineSegments(new EdgesGeometry(mesh.geometry, 30), isWall ? WALL_EDGE : EDGE));
    }
    return clone;
  }, [scene]);
  return <primitive object={office} />;
}

// Half-meter drafting grid on the floor, with a stronger line every 2 m.
function FloorGrid({ room }: { room: Room }) {
  const [minor, major] = useMemo(() => {
    const fine: number[] = [];
    const bold: number[] = [];
    const y = 0.004;
    for (let x = 0; x <= room.width + 1e-6; x += 0.5) (x % 2 === 0 ? bold : fine).push(x, y, 0, x, y, room.depth);
    for (let z = 0; z <= room.depth + 1e-6; z += 0.5) (z % 2 === 0 ? bold : fine).push(0, y, z, room.width, y, z);
    const geo = (pts: number[]) => new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts, 3));
    return [geo(fine), geo(bold)];
  }, [room.width, room.depth]);
  return (
    <>
      <lineSegments geometry={minor}>
        <lineBasicMaterial color="#000000" transparent opacity={0.04} />
      </lineSegments>
      <lineSegments geometry={major}>
        <lineBasicMaterial color="#000000" transparent opacity={0.08} />
      </lineSegments>
    </>
  );
}

function Loading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return <div className="viewer-loading">Loading scan {progress.toFixed(0)}%</div>;
}

interface RoomViewerProps {
  glbUrl: string;
  room: Room;
  design: Design | null;
}

export function RoomViewer({ glbUrl, room, design }: RoomViewerProps) {
  const center: [number, number, number] = [room.width / 2, 0, room.depth / 2];
  // Slow idle spin until the user grabs the view.
  const [spin, setSpin] = useState(true);
  return (
    <div className="room-viewer">
      <Canvas shadows camera={{ position: [6, 10, 13], fov: 38, near: 0.1, far: 200 }} dpr={[1, 2]} gl={{ alpha: true }}>
        <hemisphereLight args={['#ffffff', '#e7e5e4', 1.9]} />
        <directionalLight
          position={[9, 14, 10]}
          intensity={0.9}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <Suspense fallback={null}>
          {/* Fit once to the office; the camera keeps its 3/4 view direction. */}
          <Bounds fit margin={0.78}>
            <Office key={glbUrl} glbUrl={glbUrl} />
          </Bounds>
          <FloorGrid room={room} />
          {design && <DesignOverlay key={design.id} design={design} />}
        </Suspense>
        <OrbitControls
          target={center}
          makeDefault
          maxPolarAngle={Math.PI / 2.15}
          minDistance={5}
          maxDistance={30}
          enableDamping
          autoRotate={spin}
          autoRotateSpeed={0.35}
          onStart={() => setSpin(false)}
        />
      </Canvas>
      <div className="viewer-legend">
        <span>
          <i className="lg-route" /> 36in route
        </span>
        <span>
          <i className="lg-seat" /> Seat
        </span>
        <span className="viewer-scale">Grid 0.5 m</span>
      </div>
      <Loading />
    </div>
  );
}

useGLTF.preload(DEMO_SPACE.glbUrl);
