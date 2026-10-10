/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { factionTokenStackKey } from '@shared/play/factionToken';
import { surfaceHeightAt } from '@shared/play/tableGeometry';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { allianceColor } from './allianceHues';

/* Just outside a faction token's 0.42 rim, so the ring reads as the token's own halo. */
const INNER = 0.47;
const OUTER = 0.58;

function ignoreRaycast() {
  // Painted table rings are never an interaction target.
}

/** A ring in its alliance's colour under every allied faction's token, so the whole table sees who is allied with whom. */
export function AllianceRingsScene({ table }: { table: TableProjection }) {
  const groups = table.snapshot.alliances?.groups ?? [];
  return groups.flatMap((group, index) =>
    group.flatMap((factionId) => {
      const token = table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(factionId));
      if (!token) {
        return [];
      }
      const [x, , z] = token.position;
      return [
        <mesh
          key={factionId}
          position={[x, surfaceHeightAt(token.position) + 0.004, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={ignoreRaycast}
        >
          <ringGeometry args={[INNER, OUTER, 64]} />
          <meshBasicMaterial color={allianceColor(index)} toneMapped={false} />
        </mesh>,
      ];
    })
  );
}
