import { useGLTF } from '@react-three/drei';

interface ScannedOfficeModelProps {
  glbUrl: string;
}

export function ScannedOfficeModel({ glbUrl }: ScannedOfficeModelProps) {
  const { scene } = useGLTF(glbUrl);
  return <primitive object={scene} />;
}
