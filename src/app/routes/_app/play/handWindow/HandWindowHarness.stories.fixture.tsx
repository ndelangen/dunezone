import { List, Text } from '@mantine/core';
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';

import { TableSession } from '../../../../db/tabletop/TableSession';
import type { TableProjection } from '../../../../db/tabletop/TableSession';
import compass from '../compass/CompassControls.module.css';
import { WindowFrame } from '../compass/WindowFrame';
import { DarkSchemeIsland } from '../DarkSchemeIsland';
import { GameRuntimeContext } from '../multiplayer/gameRuntime';
import { GameSubscription } from '../multiplayer/GameSubscription';
import { pieceName } from '../multiplayer/HandPiece';
import { HandWindow } from './HandWindow';
import type { HandWindowVariant } from './useHandWindow';
import '../dune-play.css';

/** Story only: the table's side of each action, so a click in the window shows where it went. */
function TableEcho({ table }: Readonly<{ table: TableProjection }>) {
  const { hand = [], battlePlan: plan, bank } = table.snapshot;
  const [log, setLog] = useState<{ seen: TableProjection; lines: string[] }>({ seen: table, lines: [] });
  if (log.seen !== table) {
    const before = log.seen.snapshot;
    const lines: string[] = [];
    const now = new Set(hand.map((piece) => piece.id));
    for (const piece of before.hand ?? []) {
      if (!now.has(piece.id)) {
        const played = table.snapshot.table.pieces.some((candidate) => candidate.id === piece.id);
        const planned = plan?.pieces.some((candidate) => candidate.id === piece.id);
        lines.push(
          `${pieceName(piece)} ${played ? 'was played face down by your faction token' : planned ? 'went into your battle plan' : 'left your hand'}.`
        );
      }
    }
    for (const piece of hand) {
      const was = before.hand?.find((candidate) => candidate.id === piece.id);
      if (piece.hiddenZone && !was?.hiddenZone) {
        lines.push(`${pieceName(piece)} moved to your private side-table.`);
      }
    }
    if (before.bank && bank && before.bank.balance !== bank.balance) {
      const change = before.bank.balance - bank.balance;
      lines.push(change > 0 ? `${change} spice went onto the table.` : `${-change} spice came back to your reserve.`);
    }
    const leaderBefore = before.battlePlan?.leaderId ?? null;
    if (plan && leaderBefore !== plan.leaderId) {
      lines.push(plan.leaderId ? 'Your plan has a leader now.' : 'Your plan has no leader now.');
    }
    if (plan && before.battlePlan && before.battlePlan.cardIds.length !== plan.cardIds.length) {
      lines.push(`Your plan holds ${plan.cardIds.length} card${plan.cardIds.length === 1 ? '' : 's'} now.`);
    }
    setLog({ seen: table, lines: [...lines, ...log.lines].slice(0, 12) });
  }
  const sideTable = hand.filter((piece) => piece.hiddenZone);
  const named = (id: string | null) => (id ? plan?.pieces.find((piece) => piece.id === id) : undefined);
  return (
    <>
      <Text size="sm">
        Spice reserve: <b>{bank?.balance ?? 0}</b>
      </Text>
      {plan && (
        <Text size="sm">
          Battle plan:{' '}
          {[named(plan.leaderId), ...plan.cardIds.map(named)]
            .flatMap((piece) => (piece ? [pieceName(piece)] : []))
            .join(', ') || 'empty'}
        </Text>
      )}
      <Text size="sm">Private side-table: {sideTable.map(pieceName).join(', ') || 'empty'}</Text>
      <List size="sm" spacing={4}>
        {log.lines.map((line, index) => (
          <List.Item key={`${log.lines.length - index}`}>{line}</List.Item>
        ))}
      </List>
    </>
  );
}

/*
 * The Hand & spice window on its own: a live table session from the story's transport, and the window in a bottom-left slot
 * on the table's dark ground, without the table itself, so each prototype can be judged alone.
 */
export function HandWindowHarness({
  variant,
  height = 448,
}: Readonly<{ variant: HandWindowVariant | null; height?: number; seat?: string }>) {
  const runtime = useContext(GameRuntimeContext);
  const [client] = useState(
    () =>
      new TableSession(
        'hand-window-story',
        new GameSubscription(
          'hand-window-story',
          /* No game page asked the database for a seat, so the story admits itself, as the tutorial's table does. */
          () => Promise.resolve({ ok: true as const, ticket: '0'.repeat(64), expiresInMs: 3_600_000 }),
          runtime
        ),
        runtime
      )
  );
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(), [client]);
  const table = view.table;
  const hand = table?.snapshot.hand;
  return (
    <DarkSchemeIsland>
      <div className="dune-play-shell" style={{ height: '100vh' }}>
        <div className={compass.root}>
          {!hand && <p style={{ padding: 16 }}>{view.error ?? `Table: ${view.status}`}</p>}
          {table && hand && (
            <WindowFrame
              entry={{
                key: 'hand',
                label: 'Hand & spice',
                group: 'Yours',
                topic: 'hand',
                description: 'Your cards, leaders and spice reserve.',
                content: <HandWindow variant={variant} client={client} table={table} hand={hand} />,
                layout: 'stack',
              }}
              tab="public"
              where="left"
              inert={false}
              style={{ height }}
              onTab={() => {}}
              actions={null}
            />
          )}
          {table && hand && (
            <WindowFrame
              entry={{
                key: 'echo',
                label: 'What reached the table',
                group: 'Story',
                topic: 'assets',
                description: 'Story only: what your clicks in the Hand & spice window did on the live table.',
                content: <TableEcho table={table} />,
                layout: 'stack',
              }}
              tab="public"
              where="right"
              inert={false}
              style={{ height }}
              onTab={() => {}}
              actions={null}
            />
          )}
        </div>
      </div>
    </DarkSchemeIsland>
  );
}
