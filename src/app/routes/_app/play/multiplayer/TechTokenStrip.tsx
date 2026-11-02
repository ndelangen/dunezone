import { Group, Stack } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterFactionIds } from '@shared/play/protocol';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { showsAlliances } from './Alliances';
import { factionToken, FactionTokenFace } from './FactionTokenFace';
import { heldTechTokenPieces } from './heldTechTokenPiece';
import { HeldTechTokens } from './HeldTechTokens';

/**
 * Who holds which tech tokens, a block of its own under the alliances in the top bar: one row per faction holding any, its token then its gears, straight on the scene with no surface around them, so it shows in every view.
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
    <Stack gap={4} role="group" aria-label="Tech tokens" data-hides-cursor style={{ pointerEvents: 'auto' }}>
      {factions.map((factionId) => {
        const token = factionToken(table, factionId, names);
        return (
          <Group key={factionId} gap={4} wrap="nowrap" role="group" aria-label={`${token.name} holds`}>
            <FactionTokenFace token={token} size={26} />
            <HeldTechTokens tokens={heldTechTokenPieces(held[factionId]!, factionId)} />
          </Group>
        );
      })}
    </Stack>
  );
}
