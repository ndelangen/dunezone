/* @jsxImportSource ./three-jsx */

import { Button } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { retainedArrakisBoard } from '@shared/boards/geometry';
import { boardPointToTable, boardTerritory } from '@shared/boards/tableTerritories';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { revealedSpiceBlows } from '@shared/play/spiceBlowPlacement';
import { spiceBlowTrigger } from '@shared/play/spiceBlowTrigger';
import { BOARD_SURFACE_Y, stackTopHeight } from '@shared/play/tableGeometry';
import { DarkSchemeIsland } from '@ui/surface/DarkSchemeIsland';

import { useTabletopSelector } from './TabletopContext';

const HTML_STYLE = { pointerEvents: 'auto' } as const;
/* The territory's button hangs just beyond its middle, so the spice it places stays in sight below it. */
const TERRITORY_LIFT = 0.32;

/* One button: what it places and where, set down over its anchor. */
function PlaceButton({
  position,
  pieceId,
  label,
}: Readonly<{ position: readonly [number, number, number]; pieceId: string; label: string }>) {
  const controls = useTabletopSelector((table) => table.spiceBlowControls);
  if (!controls) {
    return null;
  }
  return (
    <group position={[...position]}>
      <Html center zIndexRange={[6, 0]} style={HTML_STYLE}>
        {/* The label renders in its own React root, outside the page's providers, so it brings the table's own. */}
        <DarkSchemeIsland>
          <Button
            size="compact-sm"
            leftSection={<img src="/vector/icon/spice.svg" alt="" width={14} height={14} />}
            onClick={() => controls.place(pieceId)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {label}
          </Button>
        </DarkSchemeIsland>
      </Html>
    </group>
  );
}

/**
 * During Spice Blow, a button for each revealed spice card that places its spice, as often as it is pressed.
 * It sits on the lit territory or just above the card, as the story compares;
 * viewers who cannot act see none.
 */
export function SpiceBlowButtons() {
  const trigger = spiceBlowTrigger();
  const canPlace = useTabletopSelector((table) => !!table.spiceBlowControls);
  const inBlow = useTabletopSelector(
    (table) => phaseAt(table.snapshot.phase, table.snapshot.phases ?? STANDARD_PHASES).id === 'spice-blow'
  );
  const board = useTabletopSelector((table) => table.snapshot.board?.definition);
  const cards = useTabletopSelector((table) => table.state.pieces);
  if ((trigger !== 'territory' && trigger !== 'card') || !canPlace || !inBlow) {
    return null;
  }
  return (
    <>
      {revealedSpiceBlows(cards).map(({ pieceId, blow }) => {
        const card = cards.find((piece) => piece.id === pieceId)!;
        const territory = boardTerritory(board ?? retainedArrakisBoard(), blow.territories[0]!);
        if (!territory) {
          return null;
        }
        const label = `Place ${blow.amount} spice on ${territory.name}`;
        if (trigger === 'card') {
          const top = card.position[1] + stackTopHeight(card);
          return (
            <PlaceButton
              key={pieceId}
              pieceId={pieceId}
              label={label}
              position={[card.position[0], top + 0.05, card.position[2] - 0.75]}
            />
          );
        }
        const [x, z] = boardPointToTable(territory.centre);
        return (
          <PlaceButton
            key={pieceId}
            pieceId={pieceId}
            label={label}
            position={[x, BOARD_SURFACE_Y + 0.05, z - TERRITORY_LIFT]}
          />
        );
      })}
    </>
  );
}
