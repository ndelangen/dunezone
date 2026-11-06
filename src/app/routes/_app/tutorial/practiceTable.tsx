import { AssetCapture } from '@shared/play/assetCapture';
import type { BoardCapture } from '@shared/play/capture';
import type { GameSnapshot } from '@shared/play/protocol';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useArrakisBoard } from '@db/arrakis';
import { readAssetSupply } from '@db/play';
import { useCurrentProfile } from '@db/profiles';

import { CompassEpochContext } from '../play/compass/compassEpoch';
import { RememberedContext } from '../play/compass/useRemembered';
import { GameRuntimeContext } from '../play/multiplayer/gameRuntime';
import HostedTable from '../play/multiplayer/HostedTable';
import type { GameIdentity } from '../play/multiplayer/StageHeader';
import type { TablePlayers } from './chapterScripts/chapterScript';
import { withOrigin } from './setup/tutorialSetup';
import type { TutorialSetup } from './setup/tutorialSetup';
import { localRuntime } from './table/localRuntime';
import { LocalTable } from './table/localTable';
import type { TableStart } from './table/localTable';

/*
 * A chapter's live table: the Play table itself, connected to a game Worker table running in the page from the chapter's
 * checkpoint of the shared setup. Nothing reaches the game server; only a catalogue pick reads the public catalogue, as the picker does.
 * Reset puts the table back as the chapter started.
 * This module carries the Worker's table code and the setup, so the chapter page loads it lazily, and only in the browser.
 */

/** What a chapter's guide reads and does on its table. */
type TutorialTableControl = Readonly<{
  /** The table as the learner sees it now. */
  snapshot: () => GameSnapshot;
  /** Puts the table back as the chapter started, on the connection the page already holds. */
  reset: () => void;
  /** The other players, whom a chapter's tasks can have act. */
  players: TablePlayers;
}>;

/* The other players at a local table, acting on whichever table `local` gives, so they follow the table across a Reset. */
function playersAt(local: () => LocalTable): TablePlayers {
  return {
    act: (seat, action) => {
      /* The table answers another seat's move with a frame to the page, as the Worker broadcasts it. */
      const table = local();
      table.receive(
        { type: 'command', commandId: crypto.randomUUID(), action, expectedRevision: table.room.snapshot.revision },
        seat
      );
    },
    viewOf: (seat) => local().frame(seat).snapshot,
    others: () =>
      local()
        .seats()
        .filter((seat) => seat !== local().seat),
    landings: () => local().landings(),
    acceptedActions: () => local().acceptedActions(),
    pings: () => local().pings(),
    captured: (selection) => local().capturedAsset(selection),
    capturedPieces: (selection) => local().capturedPieces(selection),
  };
}

export function useTutorialTable(
  setup: TutorialSetup,
  start: () => TableStart,
  opening?: (players: TablePlayers) => void
) {
  /* The players at the table greet the learner by their own name when they answer a chat message. */
  const username = useCurrentProfile().data?.username ?? undefined;
  /* The table plays on the saved Arrakis; a Reset keeps the one it plays on. */
  const board = useArrakisBoard()?.capture;
  const [table] = useState(() => {
    const origin = window.location.origin;
    /* The board goes in before the opening, so what the opening places lands on the saved board's territories. */
    const open = (onBoard: BoardCapture | undefined) => {
      const local = new LocalTable(start());
      local.setBoard(onBoard);
      local.open();
      opening?.(playersAt(() => local));
      return local;
    };
    /* A page whose HTML embedded the saved board has it already; otherwise it joins the table when it arrives. */
    const holder = { current: open(board) };
    const runtime = localRuntime(
      () => holder.current,
      withOrigin(setup.factions, origin),
      new AssetCapture(readAssetSupply, origin)
    );
    const control: TutorialTableControl = {
      snapshot: () => holder.current.guideSnapshot(),
      players: playersAt(() => holder.current),
      reset: () => {
        const { deliver, board: kept } = holder.current;
        holder.current.dispose();
        holder.current = open(kept);
        holder.current.deliver = deliver;
        /* A read the old table left behind is answered now, so a stalled one does not hold the page's next request. */
        runtime.settleCaptures();
        /* A page replaying the old table leaves its replay only on a fresh connection, so it reconnects onto the new table. */
        if (runtime.replaying()) {
          runtime.reconnect();
          return;
        }
        deliver(holder.current.frame());
      },
    };
    return { runtime, control, holder };
  });
  useEffect(() => table.runtime.greet(username), [table, username]);
  useEffect(() => table.holder.current.setBoard(board), [table, board]);
  /* The table keeps time only while the chapter is open, so leaving it stops the table's timers. */
  useEffect(() => {
    const { holder, runtime } = table;
    holder.current.open();
    return () => {
      holder.current.dispose();
      runtime.dispose();
    };
  }, [table]);
  return table;
}

/** The practice table uses the same renderer and controls as a hosted game. */
export function PracticeTable({
  runtime,
  title,
  identity,
  exit,
  controlsEpoch = 0,
  onReady,
}: Readonly<{
  runtime: ReturnType<typeof localRuntime>;
  title: string;
  identity: GameIdentity;
  exit: ReactNode;
  controlsEpoch?: number;
  onReady?: () => void;
}>) {
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <PageTitle title={title} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <GameRuntimeContext value={runtime}>
          <RememberedContext value={false}>
            <CompassEpochContext value={controlsEpoch}>
              <HostedTable gameId="tutorial" exitControl={exit} identity={identity} onReady={onReady} />
            </CompassEpochContext>
          </RememberedContext>
        </GameRuntimeContext>
      </PageLayout.Content>
    </PageLayout>
  );
}
