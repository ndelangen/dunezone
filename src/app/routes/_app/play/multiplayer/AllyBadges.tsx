/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { alliesOf } from '@shared/play/alliances';
import { factionTokenStackKey } from '@shared/play/factionToken';
import { surfaceHeightAt } from '@shared/play/tableGeometry';
import { useEffect, useState } from 'react';
import { SRGBColorSpace, TextureLoader } from 'three';
import type { Texture } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/* Each ally's token lies under the faction's own 0.42 token, a size larger per ally, so its edge shows round the token in the ally's colour. */
const FIRST_RADIUS = 0.54;
const STEP = 0.1;

function ignoreRaycast() {
  // Floating badges are never an interaction target.
}

function useFaceTexture(href: string | undefined) {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    if (!href) {
      return;
    }
    let live = true;
    new TextureLoader().load(href, (loaded) => {
      loaded.colorSpace = SRGBColorSpace;
      if (live) {
        setTexture(loaded);
      }
    });
    return () => {
      live = false;
    };
  }, [href]);
  return texture;
}

function AllyDisc({ href, radius, y }: { href: string | undefined; radius: number; y: number }) {
  const texture = useFaceTexture(href);
  return (
    <mesh raycast={ignoreRaycast} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 64]} />
      {/* Keyed by its texture, so a face that loads late builds a material that samples it. */}
      <meshStandardMaterial
        key={texture?.uuid ?? 'blank'}
        map={texture}
        color={texture ? '#ffffff' : '#3a2a22'}
        roughness={0.8}
        metalness={0.05}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

/** Under every allied faction's token, its allies' tokens lie flat and a little larger, so each seat shows its allies' colours. */
export function AllyBadgesScene({ table }: { table: TableProjection }) {
  const alliances = table.snapshot.alliances;
  const token = (factionId: string) =>
    table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(factionId));
  return (alliances?.groups ?? []).flat().flatMap((factionId) => {
    const own = token(factionId);
    if (!own) {
      return [];
    }
    const [x, , z] = own.position;
    /* The largest disc lies lowest, so each smaller one shows on top of it. */
    return [
      <group key={factionId} position={[x, surfaceHeightAt(own.position), z]}>
        {alliesOf(alliances, factionId).map((ally, index, allies) => (
          <AllyDisc
            key={ally}
            href={token(ally)?.items[0]?.artwork?.front}
            radius={FIRST_RADIUS + (allies.length - 1 - index) * STEP}
            y={0.002 + index * 0.001}
          />
        ))}
      </group>,
    ];
  });
}
