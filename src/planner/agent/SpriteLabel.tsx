import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

interface SpriteLabelProps {
  text: string;
  color: string;
  position: [number, number, number];
  height?: number; // world meters
  textColor?: string;
}

// Text badge drawn into a canvas texture. Used instead of drei <Html>, which
// throws removeChild errors under React 19 when labels unmount.
export function SpriteLabel({ text, color, position, height = 0.32, textColor = '#ffffff' }: SpriteLabelProps) {
  const { texture, aspect } = useMemo(() => {
    const scale = 4;
    const font = `600 ${13 * scale}px Inter, system-ui, sans-serif`;
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = font;
    const h = 24 * scale;
    const w = Math.max(h, measure.measureText(text).width + 20 * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + scale);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return { texture: tex, aspect: w / h };
  }, [text, color, textColor]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}
