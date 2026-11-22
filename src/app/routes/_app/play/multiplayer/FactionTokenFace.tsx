import { Group, Tooltip } from '@mantine/core';
import { factionTokenOf } from '@shared/play/factionToken';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { factionColor } from './allianceColors';

/* The token and its face are shared with the standalone tools; Play reads them off the table. */
export { FactionTokenFace };
export type { FactionToken };

/** A faction's token face as it lies on the table. */
export function factionTokenFace(table: TableProjection, factionId: string) {
  return snapshotTokenFace(table.snapshot, factionId);
}

function snapshotTokenFace(snapshot: TableProjection['snapshot'], factionId: string) {
  return factionTokenOf(snapshot.table.pieces, factionId)?.items[0]?.artwork?.front;
}

/** A faction's token as the table has it, named from `names`; `standIn` is the face to show where the table has no token for it. */
export function factionToken(
  table: TableProjection,
  factionId: string,
  names: Readonly<Record<string, string>>,
  standIn?: string | null
): FactionToken {
  return snapshotFactionToken(table.snapshot, factionId, names, standIn);
}

/** A faction's token as a snapshot of the table has it, or only its name and initial where there is no snapshot. */
export function snapshotFactionToken(
  snapshot: TableProjection['snapshot'] | undefined,
  factionId: string,
  names: Readonly<Record<string, string>>,
  standIn?: string | null
): FactionToken {
  return {
    id: factionId,
    name: names[factionId] ?? factionId,
    src: (snapshot && snapshotTokenFace(snapshot, factionId)) ?? standIn,
    color: snapshot && factionColor(snapshot, factionId),
  };
}

/**
 * Several factions' tokens overlapping in a row, each an image named after its faction, with the name in a tooltip for a pointer.
 * The tooltip opens on hover only, and the token takes no focus, so without the name a keyboard or screen-reader user would never learn whose token it is.
 */
export function FactionTokenGroup({ tokens, size }: Readonly<{ tokens: readonly FactionToken[]; size: number }>) {
  return (
    <Group gap={0} wrap="nowrap" style={{ flexShrink: 0 }}>
      {tokens.map((token, index) => (
        <Tooltip key={token.id} label={token.name} withinPortal>
          <FactionTokenFace
            token={token}
            size={size}
            role="img"
            aria-label={token.name}
            style={{ marginLeft: index ? -Math.round(size / 4) : 0 }}
          />
        </Tooltip>
      ))}
    </Group>
  );
}
