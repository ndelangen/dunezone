import { tableProgressFor } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { RoomView } from '@shared/play/updates';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { TableSession } from '@db/tabletop/TableSession';
import { PointerSession } from '@app/widgets/tabletop/PointerSession';
import { PointerSessionContext } from '@app/widgets/tabletop/PointerSessionContext';
import { TableKeyboard } from '@app/widgets/tabletop/TableKeyboard';
import { TableKeyboardContext } from '@app/widgets/tabletop/TableKeyboardContext';
import { TabletopSessionProvider } from '@app/widgets/tabletop/TabletopContext';
import { TabletopScene } from '@app/widgets/tabletop/TabletopScene';

import styles from './ReportTable.module.css';

/** The existing table renderer receives a fixed capture and a subscription that cannot send commands. */
export default function ReportTable({ snapshot }: { snapshot: GameSnapshot }) {
  const [session] = useState(() => {
    const view: RoomView = {
      type: 'view',
      epoch: 'report',
      sequence: 1,
      viewer: { connectionId: 'report', userId: 'report', viewerSeat: SPECTATOR_SEAT, displayName: '', color: 'gray' },
      snapshot,
      carries: [],
      pointers: [],
    };
    return new TableSession(
      'report-preview',
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
          throw new Error('A report preview cannot connect to a game.');
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
          <div className={styles.table}>
            <TabletopScene
              presentation="preview"
              stage={snapshot.stage ?? 'play'}
              seatCount={snapshot.roster?.seatCount}
              tableProgress={tableProgressFor(snapshot.phase, snapshot.phases)}
            />
          </div>
        </TabletopSessionProvider>
      </TableKeyboardContext>
    </PointerSessionContext>
  );
}
