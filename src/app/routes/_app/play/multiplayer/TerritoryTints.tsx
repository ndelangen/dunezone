import { ActionIcon, Button, ColorSwatch, Group, Popover, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { retainedArrakisBoard } from '@shared/boards/geometry';
import { territoryId } from '@shared/boards/schema';
import {
  fitsTintCommand,
  MAX_TINTS,
  TINT_COLOR_NAMES,
  TINT_COLORS,
  TINT_STAMPS,
  tintSetting,
} from '@shared/play/territoryTints';
import type { TerritoryTint, TerritoryTintAction, TintStamp } from '@shared/play/territoryTints';
import { Section } from '@ui/block/Section';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { Brush, Eye, EyeOff, Square, Sticker } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { TerritoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { setTerritoryBrush, territoryBrush, useTerritoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { TINT_STICKERS } from '../../../../widgets/tabletop/tintStickers';
import { territoryTintPresets } from './territoryTintPresets';

type Props = { client: TableSession; table: TableProjection };
type TintDraft = Omit<TerritoryTint, 'id'>;
type TintSetting = Extract<TerritoryTintAction, { kind: 'tint-set' }>['setting'];

const svgUrl = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
const STICKER_MASKS = Object.fromEntries(
  TINT_STAMPS.map((stamp) => [stamp, svgUrl(TINT_STICKERS[stamp].svg)])
) as Record<TintStamp, string>;

/** A sticker's artwork in the button's own colour, so it follows the button's state like a lucide icon. */
function StickerIcon({ stamp }: Readonly<{ stamp: TintStamp }>) {
  const mask = `${STICKER_MASKS[stamp]} center / contain no-repeat`;
  return (
    <span
      aria-hidden
      style={{ display: 'block', width: 18, height: 18, background: 'currentColor', mask, WebkitMask: mask }}
    />
  );
}

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
  const tint = tints.find((candidate) => candidate.id === brush.tintId);
  return !canEdit || !!tint?.hidden || (settled && !tint);
}

/** What a row says under the tint's name: painting, hidden, its one territory, or how many it covers. */
function tintSummary(tint: TerritoryTint, painting: boolean, names: ReadonlyMap<string, string>) {
  if (tint.hidden) {
    return 'Hidden';
  }
  if (painting) {
    return 'Painting: click territories on the board';
  }
  if (tint.territories.length === 1) {
    return names.get(tint.territories[0]) ?? '1 territory';
  }
  return `${tint.territories.length} territories`;
}

/** A switch on a tint's row: the button looks pressed while the setting is on. */
function SettingToggle({
  label,
  on,
  enabled,
  onToggle,
  children,
}: Readonly<{ label: string; on: boolean; enabled: boolean; onToggle: () => void; children: ReactNode }>) {
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant={on ? 'light' : 'subtle'}
        color={on ? 'yellow' : 'gray'}
        aria-label={label}
        aria-pressed={on}
        disabled={!enabled}
        onClick={onToggle}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

/** One button for a tint's stickers, opening a picker where each sticker switches on and off. */
function StickerPicker({
  tint,
  enabled,
  onToggle,
}: Readonly<{ tint: TerritoryTint; enabled: boolean; onToggle: (stamp: TintStamp) => void }>) {
  const count = tint.stamps?.length ?? 0;
  const label = `Stickers on ${tint.name}`;
  return (
    <Popover position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <Tooltip label={count ? `${label}: ${count}` : label}>
          <ActionIcon
            variant={count ? 'light' : 'subtle'}
            color={count ? 'yellow' : 'gray'}
            aria-label={label}
            disabled={!enabled}
          >
            <Sticker size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown aria-label={label}>
        <Text size="xs" c="dimmed" mb={6}>
          On every territory in {tint.name}
        </Text>
        <SimpleGrid cols={2} spacing={4} verticalSpacing={4}>
          {TINT_STAMPS.map((stamp) => {
            const on = tintSetting(tint, stamp);
            return (
              <Button
                key={stamp}
                size="compact-sm"
                justify="flex-start"
                variant={on ? 'light' : 'subtle'}
                color={on ? 'yellow' : 'gray'}
                aria-pressed={on}
                leftSection={<StickerIcon stamp={stamp} />}
                onClick={() => onToggle(stamp)}
              >
                {TINT_STICKERS[stamp].label}
              </Button>
            );
          })}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}

function TintRow({
  tint,
  painting,
  canEdit,
  names,
  onBrush,
  onSet,
  onRemove,
}: Readonly<{
  tint: TerritoryTint;
  painting: boolean;
  canEdit: boolean;
  names: ReadonlyMap<string, string>;
  onBrush: () => void;
  onSet: (setting: TintSetting, on: boolean) => void;
  onRemove: () => void;
}>) {
  const toggle = (setting: TintSetting) => () => onSet(setting, !tintSetting(tint, setting));
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="sm"
      py={6}
      style={{ borderRadius: 8, border: `1px solid ${painting ? tint.color : 'var(--mantine-color-default-border)'}` }}
    >
      <Group gap="sm" wrap="nowrap" style={{ opacity: tint.hidden ? 0.5 : 1 }}>
        <ColorSwatch color={tint.color} size={22} />
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
        <Tooltip label={tint.hidden ? `Show ${tint.name}` : `Hide ${tint.name}`}>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Show ${tint.name}`}
            aria-pressed={!tint.hidden}
            disabled={!canEdit}
            onClick={toggle('hidden')}
          >
            {tint.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </ActionIcon>
        </Tooltip>
        <SettingToggle label="Outline only" on={!!tint.outline} enabled={canEdit} onToggle={toggle('outline')}>
          <Square size={18} />
        </SettingToggle>
        <StickerPicker tint={tint} enabled={canEdit} onToggle={(stamp) => toggle(stamp)()} />
        <Tooltip label={painting ? 'Stop painting (Esc)' : `Paint ${tint.name}`}>
          <ActionIcon
            variant={painting ? 'filled' : 'subtle'}
            color={painting ? 'yellow' : 'gray'}
            autoContrast
            aria-label={`Paint ${tint.name}`}
            aria-pressed={painting}
            disabled={!canEdit || !!tint.hidden}
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
        const action = { kind: 'tint-paint', tintId, territory: territory.id, name: territory.name, painted } as const;
        if (fitsTintCommand(action)) {
          client.command(action);
        }
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
            onSet={(setting, on) => client.command({ kind: 'tint-set', tintId: tint.id, setting, on })}
            onRemove={() => client.command({ kind: 'tint-remove', tintId: tint.id })}
          />
        ))}
        <NewTints tints={tints} enabled={canCreate} onCreate={(tint) => create(tint, true)} />
        <Presets presets={presets} enabled={canCreate} onCreate={(tint) => create(tint, false)} />
      </Stack>
    </Section>
  );
}
