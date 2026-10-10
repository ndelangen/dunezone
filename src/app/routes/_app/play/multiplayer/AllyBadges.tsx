/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { Billboard } from '@react-three/drei/webgpu';
import { alliesOf } from '@shared/play/alliances';
import { factionTokenStackKey } from '@shared/play/factionToken';
import { surfaceHeightAt } from '@shared/play/tableGeometry';
import { useEffect, useState } from 'react';
import { SRGBColorSpace, TextureLoader } from 'three';
import type { Texture } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

const BADGE_RADIUS = 0.2;
const GAP = 0.06;
/* Above the token, clear of its troops, so the badges read from every view. */
const LIFT = 0.62;
const GOLD = '#d2ae68';

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

function Badge({ href, x }: { href: string | undefined; x: number }) {
  const texture = useFaceTexture(href);
  return (
    <group position={[x, 0, 0]}>
      <mesh raycast={ignoreRaycast} position={[0, 0, -0.001]}>
        <circleGeometry args={[BADGE_RADIUS + 0.025, 48]} />
        <meshBasicMaterial color={GOLD} toneMapped={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        <circleGeometry args={[BADGE_RADIUS, 48]} />
        {/* Keyed by its texture, so a face that loads late builds a material that samples it. */}
        <meshBasicMaterial
          key={texture?.uuid ?? 'blank'}
          map={texture}
          color={texture ? '#ffffff' : '#3a2a22'}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Over every allied faction's token, its allies' tokens in small, so each seat shows who it is allied with. */
export function AllyBadgesScene({ table }: { table: TableProjection }) {
  const alliances = table.snapshot.alliances;
  const token = (factionId: string) =>
    table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(factionId));
  return (alliances?.groups ?? []).flat().flatMap((factionId) => {
    const own = token(factionId);
    if (!own) {
      return [];
    }
    const allies = alliesOf(alliances, factionId);
    const width = allies.length * BADGE_RADIUS * 2 + (allies.length - 1) * GAP;
    const [x, , z] = own.position;
    return [
      <Billboard key={factionId} position={[x, surfaceHeightAt(own.position) + LIFT, z]}>
        {allies.map((ally, index) => (
          <Badge
            key={ally}
            href={token(ally)?.items[0]?.artwork?.front}
            x={-width / 2 + BADGE_RADIUS + index * (BADGE_RADIUS * 2 + GAP)}
          />
        ))}
      </Billboard>,
    ];
  });
}
