/* @jsxImportSource ./three-jsx */
import { useEffect, useMemo, useState } from 'react';
import type { ExtrudeGeometry } from 'three';

import { createPhaseRingGeometry, loadPhaseSymbolGeometry } from './phaseSymbolGeometry';
import { PHASE_DISC_COLOR, PHASE_INK_COLOR } from './phaseSymbolLayout';

function ignoreRaycast() {
  /* Symbols decorate the phase wells and never intercept tabletop gestures. */
}

function PhaseArtwork({ symbol, radius }: Readonly<{ symbol: string; radius: number }>) {
  const [geometry, setGeometry] = useState<ExtrudeGeometry | null>(null);

  useEffect(() => loadPhaseSymbolGeometry(symbol, radius, setGeometry), [radius, symbol]);

  return geometry ? (
    <mesh raycast={ignoreRaycast}>
      {/* Primitive geometry is owned by the loading effect; Fiber owns the material. */}
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
    </mesh>
  ) : null;
}

export function PhaseSymbol({ symbol, radius }: Readonly<{ symbol?: string; radius: number }>) {
  const ring = useMemo(() => createPhaseRingGeometry(radius), [radius]);
  useEffect(() => () => ring.dispose(), [ring]);

  return (
    <group>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast} receiveShadow>
        {/* The cream face leaves a narrow outer accent from the active phase well. */}
        <circleGeometry args={[radius * 0.96, 96]} />
        <meshStandardMaterial color={PHASE_DISC_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        {/* The ring stays visible while artwork loads or when its image is unavailable. */}
        <primitive object={ring} attach="geometry" />
        <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
      {symbol ? <PhaseArtwork key={`${symbol}:${radius}`} symbol={symbol} radius={radius} /> : null}
    </group>
  );
}
