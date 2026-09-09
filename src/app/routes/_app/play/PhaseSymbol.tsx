/* @jsxImportSource ./three-jsx */
import { useEffect, useState } from 'react';
import type { ExtrudeGeometry } from 'three';

import { loadPhaseSymbolGeometry } from './phaseSymbolGeometry';

function ignoreRaycast() {
  /* Symbols decorate the phase wells and never intercept tabletop gestures. */
}

export function PhaseSymbol({ symbol, radius }: { symbol: string; radius: number }) {
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
