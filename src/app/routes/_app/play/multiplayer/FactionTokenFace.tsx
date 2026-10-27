import { Avatar, Group, Tooltip } from '@mantine/core';
import { factionTokenOf } from '@shared/play/factionToken';
import { playUiColors } from '@shared/uiPalette';
import type { CSSProperties, Ref } from 'react';

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
  label,
  style,
  ref,
  ...rest
}: TokenProps &
  Readonly<{
    factionId: string;
    size: number;
    src?: string | null;
    /* The faction's name for a screen reader, where the token stands for it on its own. */
    label?: string;
    style?: CSSProperties;
    ref?: Ref<HTMLDivElement>;
  }>) {
  return (
    <Avatar
      {...rest}
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label}
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

/** Several factions' tokens overlapping in a row, each named in its tooltip and by its label. */
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
              label={name}
              style={{ marginLeft: index ? -Math.round(size / 4) : 0 }}
            />
          </Tooltip>
        );
      })}
    </Group>
  );
}
