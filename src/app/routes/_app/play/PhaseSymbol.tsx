/* @jsxImportSource ./three-jsx */
import { useEffect, useMemo, useState } from 'react';
import type { ExtrudeGeometry } from 'three';

import { createPhaseRingGeometry, loadPhaseSymbolGeometry } from './phaseSymbolGeometry';

function ignoreRaycast() {
  /* Symbols decorate the phase wells and never intercept tabletop gestures. */
}

function PhaseArtwork({ symbol, radius }: Readonly<{ symbol: string; radius: number }>) {
  const [geometry, setGeometry] = useState<ExtrudeGeometry | null>(null);

  useEffect(() => loadPhaseSymbolGeometry(symbol, radius, setGeometry), [radius, symbol]);

  return geometry ? (
    <mesh raycast={ignoreRaycast} castShadow receiveShadow>
      {/* Primitive geometry is owned by the loading effect; Fiber owns the material. */}
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color="#ead6a5" roughness={0.58} metalness={0.16} fog={false} />
    </mesh>
  ) : null;
}

export function PhaseSymbol({ symbol, radius }: Readonly<{ symbol?: string; radius: number }>) {
  const ring = useMemo(() => createPhaseRingGeometry(radius), [radius]);
  useEffect(() => () => ring.dispose(), [ring]);

  return (
    <group>
      <mesh raycast={ignoreRaycast} castShadow receiveShadow>
        {/* The ring stays visible while artwork loads or when its image is unavailable. */}
        <primitive object={ring} attach="geometry" />
        <meshStandardMaterial color="#ead6a5" roughness={0.58} metalness={0.16} fog={false} />
      </mesh>
      {symbol ? <PhaseArtwork key={`${symbol}:${radius}`} symbol={symbol} radius={radius} /> : null}
    </group>
  );
}
