import { ActionIcon, Button, ColorSwatch, Group, Stack, Text, Tooltip } from '@mantine/core';
import { retainedArrakisBoard } from '@shared/boards/geometry';
import { territoryId } from '@shared/boards/schema';
import { MAX_TINTS, TINT_COLOR_NAMES, TINT_COLORS } from '@shared/play/territoryTints';
import type { TerritoryTint } from '@shared/play/territoryTints';
import { Section } from '@ui/block/Section';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { Brush } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import atomicsSvg from '../../../../../../media/vector/decal/atomics.svg?raw';
import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { TerritoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { setTerritoryBrush, territoryBrush, useTerritoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { territoryTintPresets } from './territoryTintPresets';

type Props = { client: TableSession; table: TableProjection };
type TintDraft = Omit<TerritoryTint, 'id'>;

const ATOMICS = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(atomicsSvg.replace('<svg ', '<svg fill="#f3e6c8" '))}`;

/** "Blue tint", or "Blue tint 2" when the table already has one by that name. */
function freshName(color: (typeof TINT_COLORS)[number], tints: readonly TerritoryTint[]) {
  const base = `${TINT_COLOR_NAMES[color]} tint`;
  const names = new Set(tints.map((tint) => tint.name));
  let name = base;
  for (let count = 2; names.has(name); count++) {
    name = `${base} ${count}`;
  }
  return name;
}

/**
 * A brush that outlived this player's right to change the table, or a tint the table had and no longer has, is put down.
 * A tint this page just made is not on the table yet, so its brush waits for it until the table has answered (`settled`).
 */
function brushOutlived(brush: TerritoryBrush, canEdit: boolean, tints: readonly TerritoryTint[], settled: boolean) {
  return !canEdit || (settled && tints.every((tint) => tint.id !== brush.tintId));
}

/** What a row says under the tint's name: painting, its one territory, or how many it covers. */
function tintSummary(tint: TerritoryTint, painting: boolean, names: ReadonlyMap<string, string>) {
  if (painting) {
    return 'Painting: click territories on the board';
  }
  if (tint.territories.length === 1) {
    return names.get(tint.territories[0]) ?? '1 territory';
  }
  return `${tint.territories.length} territories`;
}

function TintRow({
  tint,
  painting,
  canEdit,
  names,
  onBrush,
  onRemove,
}: Readonly<{
  tint: TerritoryTint;
  painting: boolean;
  canEdit: boolean;
  names: ReadonlyMap<string, string>;
  onBrush: () => void;
  onRemove: () => void;
}>) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="sm"
      py={6}
      style={{ borderRadius: 8, border: `1px solid ${painting ? tint.color : 'var(--mantine-color-default-border)'}` }}
    >
      <Group gap="sm" wrap="nowrap">
        <ColorSwatch color={tint.color} size={22}>
          {tint.stamp === 'atomics' && <img src={ATOMICS} width={16} height={16} alt="" />}
        </ColorSwatch>
        <div>
          <Text size="sm" fw={600}>
            {tint.name}
          </Text>
          <Text size="xs" c="dimmed">
            {tintSummary(tint, painting, names)}
          </Text>
        </div>
      </Group>
      <Group gap={4} wrap="nowrap">
        <Tooltip label={painting ? 'Stop painting (Esc)' : `Paint ${tint.name}`}>
          <ActionIcon
            variant={painting ? 'filled' : 'subtle'}
            color={painting ? 'yellow' : 'gray'}
            autoContrast
            aria-label={`Paint ${tint.name}`}
            aria-pressed={painting}
            disabled={!canEdit}
            onClick={onBrush}
          >
            <Brush size={18} />
          </ActionIcon>
        </Tooltip>
        <ConfirmDeleteAction
          label={`Remove ${tint.name}`}
          verb="remove"
          size="sm"
          pending={false}
          disabled={!canEdit}
          onConfirm={onRemove}
        />
      </Group>
    </Group>
  );
}

function NewTints({
  tints,
  enabled,
  onCreate,
}: Readonly<{ tints: readonly TerritoryTint[]; enabled: boolean; onCreate: (tint: TintDraft) => void }>) {
  return (
    <Group gap="xs">
      <Text size="xs" c="dimmed" mr={4}>
        New tint
      </Text>
      {TINT_COLORS.map((color) => {
        const label = `New ${TINT_COLOR_NAMES[color].toLowerCase()} tint`;
        return (
          <Tooltip key={color} label={label}>
            <ColorSwatch
              component="button"
              type="button"
              color={color}
              size={22}
              aria-label={label}
              disabled={!enabled}
              style={{ cursor: enabled ? 'pointer' : 'not-allowed' }}
              onClick={() => onCreate({ name: freshName(color, tints), color, territories: [] })}
            />
          </Tooltip>
        );
      })}
    </Group>
  );
}

function Presets({
  presets,
  enabled,
  onCreate,
}: Readonly<{ presets: readonly TintDraft[]; enabled: boolean; onCreate: (tint: TintDraft) => void }>) {
  if (!presets.length) {
    return null;
  }
  return (
    <Group gap="xs">
      <Text size="xs" c="dimmed" mr={4}>
        Presets
      </Text>
      {presets.map((preset) => (
        <Button
          key={preset.name}
          size="compact-sm"
          variant="default"
          disabled={!enabled}
          onClick={() => onCreate(preset)}
        >
          {preset.name}
        </Button>
      ))}
    </Group>
  );
}

/** The paintbrush for this panel's tints: on for one tint at a time, and put down when it no longer applies. */
function useTintBrush(client: TableSession, canEdit: boolean, tints: readonly TerritoryTint[]) {
  const brush = useTerritoryBrush();
  const seen = useRef(new Set<string>());
  /* The create command of each tint this page made, so a brush on a tint the table refused is put down. */
  const created = useRef(new Map<string, string>());
  const creating = (tintId: string) => {
    const commandId = created.current.get(tintId);
    return !!commandId && client.awaiting(commandId);
  };
  useEffect(() => {
    for (const tint of tints) {
      seen.current.add(tint.id);
    }
    if (brush && brushOutlived(brush, canEdit, tints, seen.current.has(brush.tintId) || !creating(brush.tintId))) {
      setTerritoryBrush(null);
    }
  });
  useEffect(() => () => setTerritoryBrush(null), []);
  const start = (tintId: string) =>
    setTerritoryBrush({
      tintId,
      paint: (territory) => {
        const tint = client.getTable()?.snapshot.tints?.find((candidate) => candidate.id === tintId);
        if (!tint) {
          /* Still being made: the click waits for nothing. Refused or removed: the brush goes down. */
          if (!creating(tintId)) {
            setTerritoryBrush(null);
          }
          return;
        }
        const painted = !tint.territories.includes(territory.id);
        client.command({ kind: 'tint-paint', tintId, territory: territory.id, name: territory.name, painted });
      },
    });
  const create = (tint: TintDraft, paint: boolean) => {
    const tintId = `tint-${crypto.randomUUID()}`;
    const commandId = client.command({ kind: 'tint-create', tintId, ...tint });
    if (commandId !== undefined && paint) {
      created.current.set(tintId, commandId);
      start(tintId);
    }
  };
  const toggle = (tintId: string) => (territoryBrush()?.tintId === tintId ? setTerritoryBrush(null) : start(tintId));
  return { brush, create, toggle };
}

/** Shared tints over territories: make one, then switch on its paintbrush and click territories on the board to add or remove them. */
export function TerritoryTints({ client, table }: Props) {
  const tints = useMemo(() => table.snapshot.tints ?? [], [table.snapshot.tints]);
  const board = table.snapshot.board?.definition ?? retainedArrakisBoard();
  const presets = useMemo(() => territoryTintPresets(board), [board]);
  const names = useMemo(
    () => new Map(Object.values(board.properties).map((property) => [territoryId(property.name), property.name])),
    [board]
  );
  const canEdit = table.canInteract && !!table.snapshot.bank;
  const { brush, create, toggle } = useTintBrush(client, canEdit, tints);
  const canCreate = canEdit && tints.length < MAX_TINTS;

  return (
    <Section
      title="Territory tints"
      description="Everyone sees these. Turn on a tint's paintbrush, then click territories on the board to add or remove them. Escape stops painting."
    >
      <Stack gap="xs">
        {tints.map((tint) => (
          <TintRow
            key={tint.id}
            tint={tint}
            painting={brush?.tintId === tint.id}
            canEdit={canEdit}
            names={names}
            onBrush={() => toggle(tint.id)}
            onRemove={() => client.command({ kind: 'tint-remove', tintId: tint.id })}
          />
        ))}
        <NewTints tints={tints} enabled={canCreate} onCreate={(tint) => create(tint, true)} />
        <Presets presets={presets} enabled={canCreate} onCreate={(tint) => create(tint, false)} />
      </Stack>
    </Section>
  );
}
