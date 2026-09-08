/* @jsxImportSource ./three-jsx */
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

import tableLabelFontUrl from './assets/desdemona-black-regular.woff?url';
import type { Vector3Tuple } from './model';

type TableLabelProps = {
  children: string;
  color?: string;
  fontSize?: number;
  maxWidth?: number;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
};

type LabelTexture = Readonly<{
  height: number;
  texture: CanvasTexture;
  width: number;
}>;

const TABLE_LABEL_FONT_FAMILY = 'Dune Play Table Label';
const FALLBACK_FONT_FAMILY = 'Georgia, serif';
const TEXTURE_FONT_SIZE = 160;
const TEXTURE_PADDING = 12;

let tableLabelFontPromise: Promise<boolean> | undefined;

function loadTableLabelFont(): Promise<boolean> {
  if (tableLabelFontPromise) {
    return tableLabelFontPromise;
  }

  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve(false);
  }
  if (!document.fonts) {
    return Promise.resolve(false);
  }

  tableLabelFontPromise = new FontFace(TABLE_LABEL_FONT_FAMILY, `url("${tableLabelFontUrl}")`)
    .load()
    .then((fontFace) => {
      document.fonts.add(fontFace);
      return true;
    })
    .catch(() => false);

  return tableLabelFontPromise;
}

function canvasFont(fontFamily: string): string {
  const family = fontFamily === TABLE_LABEL_FONT_FAMILY ? `"${fontFamily}"` : fontFamily;
  return `${TEXTURE_FONT_SIZE}px ${family}`;
}

type LabelAppearance = Required<Pick<TableLabelProps, 'color' | 'fontSize'>> &
  Pick<TableLabelProps, 'maxWidth'> & { fontFamily: string };

function createLabelTexture(text: string, { color, fontFamily, fontSize, maxWidth }: LabelAppearance): LabelTexture {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D is required to render table labels.');
  }

  context.font = canvasFont(fontFamily);
  const metrics = context.measureText(text);
  const left = Math.max(0, metrics.actualBoundingBoxLeft);
  const right = Math.max(metrics.width, metrics.actualBoundingBoxRight);
  const ascent = Math.max(TEXTURE_FONT_SIZE, metrics.actualBoundingBoxAscent);
  const descent = Math.max(0, metrics.actualBoundingBoxDescent);

  canvas.width = Math.ceil(left + right + TEXTURE_PADDING * 2);
  canvas.height = Math.ceil(ascent + descent + TEXTURE_PADDING * 2);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = canvasFont(fontFamily);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(text, TEXTURE_PADDING + left, TEXTURE_PADDING + ascent);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;

  const naturalWidth = (canvas.width / TEXTURE_FONT_SIZE) * fontSize;
  const naturalHeight = (canvas.height / TEXTURE_FONT_SIZE) * fontSize;
  const fitScale = maxWidth ? Math.min(1, maxWidth / naturalWidth) : 1;

  return {
    height: naturalHeight * fitScale,
    texture,
    width: naturalWidth * fitScale,
  };
}

function ignoreRaycast() {
  // Painted table lettering is never an interaction target.
}

export function TableLabel({
  children,
  color = '#d2ae68',
  fontSize = 0.36,
  maxWidth,
  position,
  rotation = [-Math.PI / 2, 0, 0],
}: TableLabelProps) {
  const [fontFamily, setFontFamily] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void loadTableLabelFont().then((loaded) => {
      if (mounted) {
        setFontFamily(loaded ? TABLE_LABEL_FONT_FAMILY : FALLBACK_FONT_FAMILY);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const label = useMemo(
    () => (fontFamily ? createLabelTexture(children, { color, fontFamily, fontSize, maxWidth }) : null),
    [children, color, fontFamily, fontSize, maxWidth]
  );

  useEffect(
    () => () => {
      label?.texture.dispose();
    },
    [label]
  );

  if (!label) {
    return null;
  }

  return (
    <mesh key={`${label.width}:${label.height}`} position={position} raycast={ignoreRaycast} rotation={rotation}>
      <planeGeometry args={[label.width, label.height]} />
      <meshBasicMaterial
        alphaTest={0.01}
        depthWrite={false}
        fog={false}
        map={label.texture}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}
