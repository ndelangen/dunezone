import { Avatar, Group, Tooltip } from '@mantine/core';
import { factionTokenOf } from '@shared/play/factionToken';
import { playUiColors } from '@shared/uiPalette';
import type { AriaRole, CSSProperties, Ref } from 'react';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { factionColor } from './allianceColors';

type TokenProps = Readonly<{ table: TableProjection; names: Readonly<Record<string, string>> }>;

/** A faction's token face as it lies on the table. */
export function factionTokenFace(table: TableProjection, factionId: string) {
  return factionTokenOf(table.snapshot.table.pieces, factionId)?.items[0]?.artwork?.front;
}

/**
 * A faction's token as it lies on the table, ringed in its colour.
 * Where the table has no token for it, `src` stands in, else its initial does.
 * Any further props, a tooltip's handlers and ref among them, reach the token itself.
 */
export function FactionTokenFace({
  table,
  factionId,
  names,
  size,
  src,
  style,
  ref,
  ...rest
}: TokenProps &
  Readonly<{
    factionId: string;
    size: number;
    src?: string | null;
    style?: CSSProperties;
    ref?: Ref<HTMLDivElement>;
    /** Where the token stands alone with no text naming its faction, it is an image named after it. */
    role?: AriaRole;
    'aria-label'?: string;
  }>) {
  return (
    <Avatar
      {...rest}
      ref={ref}
      src={factionTokenFace(table, factionId) ?? src}
      size={size}
      radius="xl"
      alt=""
      style={{
        border: `1px solid ${factionColor(table.snapshot, factionId) ?? playUiColors.annotationGold}`,
        ...style,
      }}
    >
      {(names[factionId] ?? factionId).slice(0, 1)}
    </Avatar>
  );
}

/**
 * Several factions' tokens overlapping in a row, each named for a reader, and in a tooltip for a pointer.
 * The name is the token's accessible name: it holds while the tooltip is closed, so a test reads it instead of waiting for the tooltip to draw.
 */
export function FactionTokenGroup({
  table,
  factionIds,
  names,
  size,
}: TokenProps & Readonly<{ factionIds: readonly string[]; size: number }>) {
  return (
    <Group gap={0} wrap="nowrap" style={{ flexShrink: 0 }}>
      {factionIds.map((factionId, index) => {
        const name = names[factionId] ?? factionId;
        return (
          <Tooltip key={factionId} label={name} withinPortal>
            <FactionTokenFace
              table={table}
              factionId={factionId}
              names={names}
              size={size}
              role="img"
              aria-label={name}
              style={{ marginLeft: index ? -Math.round(size / 4) : 0 }}
            />
          </Tooltip>
        );
      })}
    </Group>
  );
}
