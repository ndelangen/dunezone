import preview from '@sb/preview';
import { homepageSnapshot } from '@shared/homepage/setup';
import type { BoardCapture } from '@shared/play/capture';
import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import { tableProgressFor } from '@shared/play/phases';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { RoomView } from '@shared/play/updates';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { expect, spyOn, waitFor, within } from 'storybook/test';
import type { MockInstance } from 'storybook/test';

import { TableSession } from '@db/tabletop/TableSession';

import { curvedBoard } from './curvedBoard.fixture';
import { PointerSession } from './PointerSession';
import { PointerSessionContext } from './PointerSessionContext';
import { TableKeyboard } from './TableKeyboard';
import { TableKeyboardContext } from './TableKeyboardContext';
import { TabletopSessionProvider } from './TabletopContext';
import { TabletopScene } from './TabletopScene';

function PreparedTable({ presentation, board }: { presentation: 'play' | 'preview'; board?: BoardCapture }) {
  const [session] = useState(() => {
    const view: RoomView = {
      type: 'view',
      epoch: 'story',
      sequence: 1,
      viewer: { connectionId: 'story', userId: 'story', viewerSeat: SPECTATOR_SEAT, displayName: '', color: '#d7b65c' },
      snapshot: { ...homepageSnapshot(location.origin), board },
      carries: [],
      pointers: [],
    };
    return new TableSession(
      'story',
      {
        status: 'authorized',
        ready: true,
        getSnapshot: () => view,
        serverNow: () => 0,
        send: () => false,
        supportsCommand: () => false,
        subscribe(listener) {
          listener({ ...view, previous: null, snapshotChanged: true });
          return () => {};
        },
      },
      {
        openSocket() {
          throw new Error('The prepared story has no transport.');
        },
        monotonicNow: () => 0,
        onHidden: () => () => {},
        onVisible: () => () => {},
        onOnline: () => () => {},
      }
    );
  });
  const [pointer] = useState(() => new PointerSession());
  const [keyboard] = useState(() => new TableKeyboard());
  const ready = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable() !== null,
    () => false
  );
  useEffect(() => session.connect(), [session]);
  if (!ready) {
    return null;
  }
  return (
    <PointerSessionContext value={pointer}>
      <TableKeyboardContext value={keyboard}>
        <TabletopSessionProvider session={session}>
          <div style={{ height: 700, display: 'grid' }}>
            <TabletopScene presentation={presentation} stage="play" tableProgress={tableProgressFor(0)} />
          </div>
        </TabletopSessionProvider>
      </TableKeyboardContext>
    </PointerSessionContext>
  );
}

const meta = preview.meta({ component: PreparedTable, parameters: { layout: 'fullscreen' } });
export const Play = meta.story({ args: { presentation: 'play' } });
/** The homepage's preview draws the table without the play tools, so a visitor has nothing to select. */
export const Homepage = meta.story({
  args: { presentation: 'preview' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('img', { name: 'Game table' })).resolves.toBeInTheDocument();
    await expect(page.queryByRole('button', { name: 'Selected piece actions' })).toBeNull();
    await expect(page.queryByRole('alert')).toBeNull();
  },
});

/** With motion allowed, the preview's pieces arrive one after another; Chromatic captures them at rest in Homepage. */
export const HomepageArrival = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  globals: { motion: 'on' },
  args: { presentation: 'preview' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('img', { name: 'Game table' })).resolves.toBeInTheDocument();
    await expect(page.queryByRole('alert')).toBeNull();
  },
});

/* Installed before the story renders, since the authored board can mount before the play starts. */
let objectUrls: MockInstance<typeof URL.createObjectURL> | undefined;

/**
 * The authored board is a lazy chunk that rasterises its artwork into an SVG object URL once it mounts.
 * That URL is the one sign the chunk loaded and drew, since the board itself is pixels on the canvas.
 */
export const AuthoredArrakis = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture },
  beforeEach: () => {
    objectUrls = spyOn(URL, 'createObjectURL');
    return () => objectUrls?.mockRestore();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('img', { name: 'Game table' })).resolves.toBeInTheDocument();
    await waitFor(() => expect(objectUrls).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/svg+xml' })));
    await expect(page.queryByRole('alert')).toBeNull();
  },
});

export const CurvesAndIsland = meta.story({ args: { presentation: 'play', board: curvedBoard() } });
