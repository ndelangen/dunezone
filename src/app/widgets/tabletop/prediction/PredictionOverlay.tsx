/* @jsxImportSource ../three-jsx */
import { CARD_WIDTH, CARD_DEPTH } from '@shared/play/tableGeometry';
import { useMemo, useEffect } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

import type { CardPrediction } from './predictionFace';
import { usePredictionFace } from './predictionFace';

/* A prediction card's chosen logo and turn, drawn over its published base (#1753). */
export function PredictionOverlay({ prediction }: { prediction: CardPrediction }) {
  const face = usePredictionFace(prediction);
  const texture = useMemo(() => {
    if (!face) {
      return null;
    }
    const value = new CanvasTexture(face);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, [face]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) {
    return null;
  }
  return (
    <mesh position={[0, 0, 0.003]} renderOrder={2}>
      <planeGeometry args={[CARD_WIDTH, CARD_DEPTH]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
