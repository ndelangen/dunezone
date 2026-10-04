import preview from '@sb/preview';
import { homepageSnapshot } from '@shared/homepage/setup';
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

function PreparedTable({ presentation }: { presentation: 'play' | 'preview' }) {
  const [session] = useState(() => {
    const view: RoomView = {
      type: 'view',
      epoch: 'story',
      sequence: 1,
      viewer: { connectionId: 'story', userId: 'story', viewerSeat: SPECTATOR_SEAT, displayName: '', color: '#d7b65c' },
      snapshot: homepageSnapshot(location.origin),
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
