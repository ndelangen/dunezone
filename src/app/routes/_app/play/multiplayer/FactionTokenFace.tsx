import { Group, Tooltip } from '@mantine/core';
import { factionTokenOf } from '@shared/play/factionToken';
import { playUiColors } from '@shared/uiPalette';
import { NameDisc } from '@ui/content/NameDisc';
import type { AriaRole, CSSProperties, Ref } from 'react';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { factionColor } from './allianceColors';

/** What a faction's token shows: its face as it lies on the table, its colour, and the name its initial stands in for. */
export type FactionToken = Readonly<{ id: string; name: string; src?: string | null; color?: string }>;

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
 * A faction's token, ringed in its colour, or its initial where it has no face.
 * Any further props, a tooltip's handlers and ref among them, reach the token itself.
 */
export function FactionTokenFace({
  token,
  size,
  'aria-label': label,
  ...rest
}: Readonly<{
  token: FactionToken;
  size: number;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  /** A token whose faction no text beside it names is an image named after it, so a reader hears who it is. */
  role?: AriaRole;
  'aria-label'?: string;
  /** A token beside text that already names its faction is hidden from readers, its initial included. */
  'aria-hidden'?: boolean;
}>) {
  return (
    <NameDisc
      {...rest}
      label={label}
      name={token.name}
      src={token.src}
      size={size}
      ring={token.color ?? playUiColors.annotationGold}
    />
  );
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
