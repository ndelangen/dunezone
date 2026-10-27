import { retainedArrakisBoard } from '@shared/boards/geometry';
import { propertyId } from '@shared/boards/schema';
import { fitsTintCommand, MAX_TINTS, tintSetting } from '@shared/play/territoryTints';
import type { TerritoryTint } from '@shared/play/territoryTints';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import type { TerritoryBrush } from '../../../../../widgets/tabletop/territoryBrush';
import { setTerritoryBrush, territoryBrush, useTerritoryBrush } from '../../../../../widgets/tabletop/territoryBrush';
import { territoryTintPresets } from './territoryTintPresets';
import { TerritoryTintsPanel } from './TerritoryTintsPanel';
import type { TerritoryTintsPanelProps, TintDraft, TintSetting } from './TerritoryTintsPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

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

/**
 * The tints' removals.
 * A hold latches once it fires;
 * when the table refuses a removal, or it never went out, that tint's attempt counts up so its trigger remounts and the hold can be tried again.
 * A removal that goes through takes the row with it.
 */
function useTintRemovals(client: TableSession) {
  const [waiting, setWaiting] = useState<Readonly<Record<string, string>>>({});
  const [attempts, setAttempts] = useState<Readonly<Record<string, number>>>({});
  const retry = (tintId: string) => setAttempts((counts) => ({ ...counts, [tintId]: (counts[tintId] ?? 0) + 1 }));
  useEffect(() => {
    const settle = () => {
      const settled = Object.keys(waiting).filter((tintId) => !client.awaiting(waiting[tintId]!));
      if (settled.length) {
        setWaiting((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !settled.includes(id))));
        settled.forEach(retry);
      }
    };
    settle();
    const stop = client.subscribe(settle);
    return () => {
      stop();
    };
  }, [client, waiting]);
  return {
    attempt: (tintId: string) => attempts[tintId] ?? 0,
    remove: (tintId: string) => {
      const sent = client.command({ kind: 'tint-remove', tintId });
      if (sent === undefined) {
        retry(tintId);
      } else {
        setWaiting((current) => ({ ...current, [tintId]: sent }));
      }
    },
  };
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

/** The tints' rows: each tint's summary, whether its paintbrush is on, and its removal attempt. */
export function tintRows(
  table: TableProjection,
  brushTintId: string | undefined,
  attempt: (tintId: string) => number = () => 0
) {
  const board = table.snapshot.board?.definition ?? retainedArrakisBoard();
  const names = new Map(Object.values(board.properties).map((property) => [propertyId(property), property.name]));
  return (table.snapshot.tints ?? []).map((tint) => {
    const painting = brushTintId === tint.id;
    return { tint, painting, summary: tintSummary(tint, painting, names), removalAttempt: attempt(tint.id) };
  });
}

/** The tints a new table offers to start from, for the board it plays on. */
export function tintPresets(table: TableProjection) {
  return territoryTintPresets(table.snapshot.board?.definition ?? retainedArrakisBoard());
}

/** The Territory tints window from the table: its tints with their paintbrush and removal state, and the commands each control sends. */
export function useTerritoryTintsPanel({ client, table }: Props): TerritoryTintsPanelProps {
  const tints = useMemo(() => table.snapshot.tints ?? [], [table.snapshot.tints]);
  const board = table.snapshot.board?.definition ?? retainedArrakisBoard();
  const presets = useMemo(() => territoryTintPresets(board), [board]);
  const canEdit = table.canInteract && !!table.snapshot.bank;
  const pending = usePending(client);
  const removals = useTintRemovals(client);
  const { brush, create, toggle } = useTintBrush(client, canEdit, tints, pending);
  const setTint = (tintId: string, setting: TintSetting) => {
    const tint = tints.find((candidate) => candidate.id === tintId);
    const key = `${tintId} ${setting}`;
    if (tint && !pending.waiting(key)) {
      pending.sent(key, client.command({ kind: 'tint-set', tintId, setting, on: !tintSetting(tint, setting) }));
    }
  };
  return {
    rows: tintRows(table, brush?.tintId, removals.attempt),
    canEdit,
    canCreate: canEdit && tints.length < MAX_TINTS,
    presets,
    onCreate: create,
    onBrush: toggle,
    onSet: setTint,
    onColor: (tintId, color) => client.command({ kind: 'tint-color', tintId, color }),
    onRemove: removals.remove,
  };
}

/** The Territory tints window's content at a live table. */
export function ConnectedTerritoryTintsPanel(props: Props) {
  return <TerritoryTintsPanel {...useTerritoryTintsPanel(props)} />;
}
