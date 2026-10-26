import { ActionIcon, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { retainedArrakisBoard } from '@shared/boards/geometry';
import { propertyId } from '@shared/boards/schema';
import { fitsTintCommand, MAX_TINTS, tintSetting } from '@shared/play/territoryTints';
import type { TerritoryTint, TerritoryTintAction } from '@shared/play/territoryTints';
import { Section } from '@ui/block/Section';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { TerritoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { setTerritoryBrush, territoryBrush, useTerritoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { NewTints, TintRow } from '../../../../widgets/tabletop/TintControls';
import { territoryTintPresets } from './territoryTintPresets';

type Props = { client: TableSession; table: TableProjection };
type TintDraft = Omit<TerritoryTint, 'id'>;
type TintSetting = Extract<TerritoryTintAction, { kind: 'tint-set' }>['setting'];

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

/** A tint's removal. The hold latches once it fires; when the table refuses the removal, or it never went out, the trigger remounts (the attempt) so the hold can be tried again. A removal that goes through takes the row with it. */
function useTintRemoval(client: TableSession, tintId: string) {
  const [commandId, setCommandId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (commandId === null) {
      return;
    }
    const settle = () => {
      if (!client.awaiting(commandId)) {
        setCommandId(null);
        setAttempt((count) => count + 1);
      }
    };
    settle();
    const stop = client.subscribe(settle);
    return () => {
      stop();
    };
  }, [client, commandId]);
  const remove = () => {
    const sent = client.command({ kind: 'tint-remove', tintId });
    if (sent === undefined) {
      setAttempt((count) => count + 1);
    } else {
      setCommandId(sent);
    }
  };
  return { attempt, remove };
}

function TableTintRow({
  tint,
  painting,
  canEdit,
  names,
  onBrush,
  onSet,
  onColor,
  client,
}: Readonly<{
  tint: TerritoryTint;
  painting: boolean;
  canEdit: boolean;
  names: ReadonlyMap<string, string>;
  onBrush: () => void;
  onSet: (setting: TintSetting) => void;
  onColor: (color: string) => void;
  client: TableSession;
}>) {
  const removal = useTintRemoval(client, tint.id);
  return (
    <TintRow
      tint={tint}
      summary={tintSummary(tint, painting, names)}
      painting={painting}
      enabled={canEdit}
      onBrush={onBrush}
      onOutline={() => onSet('outline')}
      onStamp={onSet}
      onColor={onColor}
      before={
        <Tooltip label={tint.hidden ? `Show ${tint.name}` : `Hide ${tint.name}`}>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Show ${tint.name}`}
            aria-pressed={!tint.hidden}
            disabled={!canEdit}
            onClick={() => onSet('hidden')}
          >
            {tint.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </ActionIcon>
        </Tooltip>
      }
      after={
        <ConfirmDeleteAction
          key={removal.attempt}
          label={`Remove ${tint.name}`}
          verb="remove"
          size="sm"
          pending={false}
          disabled={!canEdit}
          onConfirm={removal.remove}
        />
      }
    />
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

type Pending = ReturnType<typeof usePending>;

/**
 * The switches this page has asked the table to flip and is still waiting on.
 * A second click before the answer, such as a double click, is dropped: sent too, it would ask for the same change again and be refused.
 */
function usePending(client: TableSession) {
  const asked = useRef(new Map<string, string>());
  return {
    waiting: (key: string) => {
      const commandId = asked.current.get(key);
      return commandId !== undefined && client.awaiting(commandId);
    },
    sent: (key: string, commandId: string | undefined) => {
      if (commandId !== undefined) {
        asked.current.set(key, commandId);
      }
    },
  };
}

/** The paintbrush for this panel's tints: on for one tint at a time, and put down when it no longer applies. */
function useTintBrush(client: TableSession, canEdit: boolean, tints: readonly TerritoryTint[], pending: Pending) {
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
        const key = `${tintId} ${territory.id}`;
        const painted = !tint.territories.includes(territory.id);
        const action = { kind: 'tint-paint', tintId, territory: territory.id, name: territory.name, painted } as const;
        if (!pending.waiting(key) && fitsTintCommand(action)) {
          pending.sent(key, client.command(action));
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
    () => new Map(Object.values(board.properties).map((property) => [propertyId(property), property.name])),
    [board]
  );
  const canEdit = table.canInteract && !!table.snapshot.bank;
  const pending = usePending(client);
  const { brush, create, toggle } = useTintBrush(client, canEdit, tints, pending);
  const setTint = (tint: TerritoryTint, setting: TintSetting) => {
    const key = `${tint.id} ${setting}`;
    if (!pending.waiting(key)) {
      pending.sent(
        key,
        client.command({ kind: 'tint-set', tintId: tint.id, setting, on: !tintSetting(tint, setting) })
      );
    }
  };
  const canCreate = canEdit && tints.length < MAX_TINTS;

  return (
    <Section
      title="Territory tints"
      description="Everyone sees these. Turn on a tint's paintbrush, then click territories on the board to add or remove them."
    >
      <Stack gap="xs">
        {tints.map((tint) => (
          <TableTintRow
            key={tint.id}
            tint={tint}
            painting={brush?.tintId === tint.id}
            canEdit={canEdit}
            names={names}
            onBrush={() => toggle(tint.id)}
            onSet={(setting) => setTint(tint, setting)}
            onColor={(color) => client.command({ kind: 'tint-color', tintId: tint.id, color })}
            client={client}
          />
        ))}
        <NewTints tints={tints} enabled={canCreate} onCreate={(tint) => create({ ...tint, territories: [] }, true)} />
        <Presets presets={presets} enabled={canCreate} onCreate={(tint) => create(tint, false)} />
      </Stack>
    </Section>
  );
}
