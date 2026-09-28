import { Box, Image, Stack, Text } from '@mantine/core';
import { phaseDeclarationSchema, SETUP_PHASE_TARGETS } from '@shared/factions/extraPhases';
import type { PhaseDeclaration } from '@shared/factions/extraPhases';
import { composeSetup, composeTurn } from '@shared/play/phases';

import { useAssetResolver } from '@game/assets/assetRenderMode';

import { phaseRowLabel } from './FactionFormSectionPhases';
import styles from './FactionPhaseSequence.module.css';

/* The preview composes this faction alone, so its storm order has one entry and ties with other factions never arise here. */
const THIS_FACTION = 'this-faction';

type SequenceRow =
  | { kind: 'step'; key: string; label: string; symbol: string }
  | { kind: 'faction'; key: string; label: string; symbol: string; rowIndex: number };

/* The faction rows placed before one standard step or phase, then that step. */
type SequenceGroup = { placed: SequenceRow[]; step: SequenceRow };

/**
 * The rows the preview can place: each valid row once, in list order, keeping its index in the editor list.
 * A row the schema refuses, or one repeating an earlier row's ID, is left out and named instead.
 */
function placeableRows(rows: readonly unknown[]) {
  const declarations: PhaseDeclaration[] = [];
  const indexById = new Map<string, number>();
  const omitted: number[] = [];
  rows.forEach((row, index) => {
    const parsed = phaseDeclarationSchema.safeParse(row);
    if (!parsed.success || indexById.has(parsed.data.id)) {
      omitted.push(index);
      return;
    }
    declarations.push(parsed.data);
    indexById.set(parsed.data.id, index);
  });
  return { declarations, indexById, omitted };
}

/**
 * Setup, then one turn, as Play composes them for this faction: the same `composeSetup` and `composeTurn` the table runs.
 * Each standard step or phase ends a group;
 * the group's faction rows come before it.
 */
export function phaseSequence(rows: readonly unknown[]) {
  const { declarations, indexById, omitted } = placeableRows(rows);
  const factions = [{ factionId: THIS_FACTION, declarations }];
  const factionRow = (declaration: PhaseDeclaration): SequenceRow => ({
    kind: 'faction',
    key: `faction-${declaration.id}`,
    label: declaration.title,
    symbol: declaration.symbol,
    rowIndex: indexById.get(declaration.id)!,
  });

  const setup = composeSetup(factions, [THIS_FACTION]);
  const setupGroups = SETUP_PHASE_TARGETS.map((target): SequenceGroup => ({
    placed: setup[target.id].map((placement) => factionRow(placement.declaration)),
    step: { kind: 'step', key: `setup-${target.id}`, label: target.label, symbol: target.symbol },
  }));

  const turnGroups: SequenceGroup[] = [];
  let placed: SequenceRow[] = [];
  for (const entry of composeTurn(factions, [THIS_FACTION])) {
    if (entry.kind === 'faction') {
      const declaration = declarations.find((candidate) => entry.id === `${THIS_FACTION}:${candidate.id}`)!;
      placed.push(factionRow(declaration));
      continue;
    }
    turnGroups.push({
      placed,
      step: { kind: 'step', key: `turn-${entry.id}`, label: entry.label, symbol: entry.symbol },
    });
    placed = [];
  }

  return { setupGroups, turnGroups, omitted };
}

function SequenceList({
  label,
  groups,
  selectedIndex,
}: {
  label: string;
  groups: SequenceGroup[];
  selectedIndex: number;
}) {
  const resolve = useAssetResolver();
  const renderRow = (row: SequenceRow) => {
    const selected = row.kind === 'faction' && row.rowIndex === selectedIndex;
    return (
      <li
        key={row.key}
        className={styles.row}
        data-kind={row.kind}
        data-selected={selected || undefined}
        aria-current={selected || undefined}
      >
        <Image className={styles.symbol} src={resolve(row.symbol)} alt="" fit="contain" />
        <Text className={styles.label} size="sm" fw={row.kind === 'faction' ? 700 : 400} truncate>
          {row.label}
        </Text>
      </li>
    );
  };
  return (
    <Stack gap={4}>
      <Text fw={800} size="xs" tt="uppercase" c="dimmed">
        {label}
      </Text>
      <ol className={styles.list} aria-label={label}>
        {groups.flatMap(({ placed, step }) => [
          ...placed.map(renderRow),
          /* This faction's rows here could tie with another faction's at the same priority; the table orders those by the storm. The hint is a note, not a step, so it stays out of the list's item count. */
          ...(placed.length > 0
            ? [
                <li key={`${step.key}-ties`} className={styles.tieHint} role="none">
                  <Text size="xs" c="dimmed">
                    Another faction&apos;s phase here at the same priority goes in storm order.
                  </Text>
                </li>,
              ]
            : []),
          renderRow(step),
        ])}
      </ol>
    </Stack>
  );
}

/** A read-only view of where this faction's phases fall: setup, then one turn, each with its symbol. */
export function FactionPhaseSequence({ rows, selectedIndex }: { rows: readonly unknown[]; selectedIndex: number }) {
  const { setupGroups, turnGroups, omitted } = phaseSequence(rows);
  const hasPlacedRows = [...setupGroups, ...turnGroups].some((group) => group.placed.length > 0);
  return (
    <Box component="section" className={styles.sequence} aria-label="Phase sequence">
      <Stack className={styles.sections} gap="md">
        {rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            This faction adds no phases, so the game runs the standard setup and turn.
          </Text>
        ) : null}
        {omitted.length > 0 ? (
          <Text size="sm" c="var(--color-caution)">
            Left out until fixed:{' '}
            {omitted.map((index) => phaseRowLabel(rows[index] as Partial<PhaseDeclaration>, index)).join(', ')}.
          </Text>
        ) : null}
        <SequenceList label="Setup" groups={setupGroups} selectedIndex={selectedIndex} />
        <SequenceList label="Each turn" groups={turnGroups} selectedIndex={selectedIndex} />
        {/* The storm-order hint once for the whole sequence, which the stylesheet shows in place of the per-group hints when the preview column is narrow. */}
        {hasPlacedRows ? (
          <Text className={styles.stormNote} size="xs" c="dimmed">
            Ties with other factions go in storm order.
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}
