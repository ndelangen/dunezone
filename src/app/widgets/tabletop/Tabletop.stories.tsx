import preview from '@sb/preview';
import { blankBoard, derive, defaults, CENTER } from '@shared/boards/geometry';
import { homepageSnapshot } from '@shared/homepage/setup';
import type { BoardCapture } from '@shared/play/capture';
import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import { tableProgressFor } from '@shared/play/phases';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { RoomView } from '@shared/play/updates';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { TableSession } from '@db/tabletop/TableSession';

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
export const Homepage = meta.story({ args: { presentation: 'preview' } });

export const AuthoredArrakis = meta.story({ args: { presentation: 'play', board: arrakisBoardCapture } });

function curvedBoard(): BoardCapture {
  const board = blankBoard();
  Object.assign(board.nodes, { il: [207.53, 323.53], ir: [303.53, 323.53] });
  board.edges.push(
    { id: 'curve', a: 'w', b: 'e', kind: 'cubic', c1: [150, 30], c2: [350, 320] },
    { id: 'island-a', a: 'il', b: 'ir', kind: 'arc', arc: [48, 48, 0, 0, 1] },
    { id: 'island-b', a: 'ir', b: 'il', kind: 'arc', arc: [48, 48, 0, 0, 1] }
  );
  board.properties = Object.fromEntries(
    derive(board).faces.map((face, index) => [
      face.key,
      defaults(
        `Territory ${index + 1}`,
        face.area < 8000 ? 'stronghold' : face.center[1] < CENTER[1] ? 'rock' : 'sand'
      ),
    ])
  );
  const island = Object.values(board.properties).find((p) => p.type === 'stronghold')!;
  island.decals = [
    { id: 'custom-art', artwork: '/vector/troop/atreides.svg', x: 255, y: 323, scale: 70, rotation: 35, outline: true },
  ];
  return { asset: { id: 'curves', slug: 'curves', name: 'Curves and island' }, definition: board };
}
export const CurvesAndIsland = meta.story({ args: { presentation: 'play', board: curvedBoard() } });
