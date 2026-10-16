import { ActionIcon, Button, ColorSwatch, Group, Stack, Text, Tooltip } from '@mantine/core';
import { arrakisBoard } from '@shared/boards/geometry';
import { territoryId } from '@shared/boards/schema';
import { MAX_TINTS, TINT_COLOR_NAMES, TINT_COLORS } from '@shared/play/territoryTints';
import type { TerritoryTint } from '@shared/play/territoryTints';
import { Section } from '@ui/block/Section';
import { Brush, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import atomicsSvg from '../../../../../../media/vector/decal/atomics.svg?raw';
import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { setTerritoryBrush, territoryBrush, useTerritoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { territoryTintPresets } from './territoryTintPresets';

type Props = { client: TableSession; table: TableProjection };

const ATOMICS = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(atomicsSvg.replace('<svg ', '<svg fill="#f3e6c8" '))}`;

function newTintId() {
  return `tint-${crypto.randomUUID()}`;
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

/** Shared tints over territories: make one, then switch on its paintbrush and click territories on the board to add or remove them. */
export function TerritoryTints({ client, table }: Props) {
  const tints = useMemo(() => table.snapshot.tints ?? [], [table.snapshot.tints]);
  const board = table.snapshot.board?.definition ?? arrakisBoard();
  const presets = useMemo(() => territoryTintPresets(board), [board]);
  const names = useMemo(
    () => new Map(Object.values(board.properties).map((property) => [territoryId(property.name), property.name])),
    [board]
  );
  const brush = useTerritoryBrush();
  const canEdit = table.canInteract && !!table.snapshot.bank;
  const full = tints.length >= MAX_TINTS;

  /* The brush goes with its tint, and with this player's right to change the table. */
  useEffect(() => {
    if (brush && (!canEdit || !tints.some((tint) => tint.id === brush.tintId))) {
      setTerritoryBrush(null);
    }
  }, [brush, canEdit, tints]);
  useEffect(() => () => setTerritoryBrush(null), []);

  const startBrush = (tintId: string) =>
    setTerritoryBrush({
      tintId,
      paint: (territory) => {
        client.command({ kind: 'tint-paint', tintId, territory: territory.id, name: territory.name });
      },
    });
  const toggleBrush = (tintId: string) => {
    if (territoryBrush()?.tintId === tintId) {
      setTerritoryBrush(null);
    } else {
      startBrush(tintId);
    }
  };
  const create = (tint: Omit<TerritoryTint, 'id'>, paint: boolean) => {
    const tintId = newTintId();
    if (client.command({ kind: 'tint-create', tintId, ...tint }) !== undefined && paint) {
      startBrush(tintId);
    }
  };

  return (
    <Section
      title="Territory tints"
      description="Everyone sees these. Turn on a tint's paintbrush, then click territories on the board to add or remove them. Escape stops painting."
    >
      <Stack gap="xs">
        {tints.map((tint) => {
          const painting = brush?.tintId === tint.id;
          const count = tint.territories.length;
          return (
            <Group
              key={tint.id}
              justify="space-between"
              wrap="nowrap"
              px="sm"
              py={6}
              style={{
                borderRadius: 8,
                border: `1px solid ${painting ? tint.color : 'var(--mantine-color-default-border)'}`,
              }}
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
                    {painting
                      ? 'Painting: click territories on the board'
                      : count === 1
                        ? (names.get(tint.territories[0]) ?? '1 territory')
                        : `${count} territories`}
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
                    onClick={() => toggleBrush(tint.id)}
                  >
                    <Brush size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={`Remove ${tint.name}`}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={`Remove ${tint.name}`}
                    disabled={!canEdit}
                    onClick={() => client.command({ kind: 'tint-remove', tintId: tint.id })}
                  >
                    <X size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          );
        })}
        <Group gap="xs">
          <Text size="xs" c="dimmed" mr={4}>
            New tint
          </Text>
          {TINT_COLORS.map((color) => (
            <Tooltip key={color} label={`New ${TINT_COLOR_NAMES[color].toLowerCase()} tint`}>
              <ColorSwatch
                component="button"
                type="button"
                color={color}
                size={22}
                aria-label={`New ${TINT_COLOR_NAMES[color].toLowerCase()} tint`}
                disabled={!canEdit || full}
                style={{ cursor: canEdit && !full ? 'pointer' : 'not-allowed' }}
                onClick={() => create({ name: freshName(color, tints), color, territories: [] }, true)}
              />
            </Tooltip>
          ))}
        </Group>
        {presets.length > 0 && (
          <Group gap="xs">
            <Text size="xs" c="dimmed" mr={4}>
              Presets
            </Text>
            {presets.map((preset) => (
              <Button
                key={preset.name}
                size="compact-sm"
                variant="default"
                disabled={!canEdit || full}
                onClick={() => create(preset, false)}
              >
                {preset.name}
              </Button>
            ))}
          </Group>
        )}
      </Stack>
    </Section>
  );
}
