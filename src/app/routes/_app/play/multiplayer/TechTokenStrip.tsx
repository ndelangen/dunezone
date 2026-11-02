import { Group } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterFactionIds } from '@shared/play/protocol';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { allianceStripPill, showsAlliances } from './Alliances';
import { factionToken, FactionTokenFace } from './FactionTokenFace';
import { heldTechTokenPieces } from './heldTechTokenPiece';
import { HeldTechTokens } from './HeldTechTokens';

/**
 * Who holds which tech tokens, a row of its own under the alliances in the top bar: one pill per faction holding any, its token then its gears, with no surface around the row, so it shows in every view.
 * The row keeps to the top bar's width and scrolls sideways when the pills outgrow it.
 * Each gear names itself and what it does on hover, and Alt shows it larger.
 * Everyone sees it, observers included, as tech tokens are public.
 */
export function TechTokenStrip({ table }: Readonly<{ table: TableProjection }>) {
  const held = table.snapshot.techTokens ?? {};
  const factions = rosterFactionIds(table.snapshot.roster).filter((id) => held[id]?.length);
  if (!factions.length || !showsAlliances(table.snapshot.stage)) {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      role="group"
      aria-label="Tech tokens"
      style={{ flex: '0 1 auto', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}
    >
      {factions.map((factionId) => {
        const token = factionToken(table, factionId, names);
        return (
          <Group
            key={factionId}
            gap={4}
            wrap="nowrap"
            role="group"
            aria-label={`${token.name} holds`}
            style={allianceStripPill}
          >
            <FactionTokenFace token={token} size={26} />
            <HeldTechTokens tokens={heldTechTokenPieces(held[factionId]!, factionId)} />
          </Group>
        );
      })}
    </Group>
  );
}
