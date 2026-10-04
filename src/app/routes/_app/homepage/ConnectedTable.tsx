import { HOMEPAGE_SOCKET_PATH } from '@shared/homepage/protocol';
import { tableProgressFor } from '@shared/play/phases';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

import { requestHomepageTicket } from '@db/homepage';
import type { GameRuntime } from '@db/tabletop/runtime';
import { TableSession } from '@db/tabletop/TableSession';
import { PointerSession } from '@app/widgets/tabletop/PointerSession';
import { PointerSessionContext } from '@app/widgets/tabletop/PointerSessionContext';
import { TableKeyboard } from '@app/widgets/tabletop/TableKeyboard';
import { TableKeyboardContext } from '@app/widgets/tabletop/TableKeyboardContext';
import { TabletopSessionProvider, useTabletopReader } from '@app/widgets/tabletop/TabletopContext';
import { TabletopScene } from '@app/widgets/tabletop/TabletopScene';

import styles from '../index.module.css';
import { HomepageSubscription } from './HomepageSubscription';

const runtime: GameRuntime = {
  openSocket() {
    const url = new URL(HOMEPAGE_SOCKET_PATH, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(url);
  },
  monotonicNow: () => performance.now(),
  onHidden(listener) {
    const changed = () => {
      if (document.hidden) {
        listener();
      }
    };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
  onVisible(listener) {
    const changed = () => {
      if (!document.hidden) {
        listener();
      }
    };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
  onOnline(listener) {
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
};

function KeyboardBinding({ keyboard }: { keyboard: TableKeyboard }) {
  const read = useTabletopReader();
  useLayoutEffect(
    () =>
      keyboard.bind({
        events: window,
        read: () => {
          const table = read();
          return {
            ...table,
            canHandleTable:
              table.canHandleTable && (table.hoveredPieceId !== null || table.gestureActivePieceId !== null),
          };
        },
      }),
    [keyboard, read]
  );
  return null;
}

export default function ConnectedTable({
  member,
  onReady,
  onUnavailable,
}: {
  member: boolean;
  onReady(): void;
  onUnavailable(): void;
}) {
  const [session] = useState(
    () =>
      new TableSession('homepage', new HomepageSubscription(runtime, member ? requestHomepageTicket : null), runtime)
  );
  const [pointer] = useState(() => new PointerSession());
  const [keyboard] = useState(() => new TableKeyboard());
  const hasTable = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable() !== null,
    () => false
  );
  useEffect(() => session.connect(), [session]);
  if (!hasTable) {
    return null;
  }
  return (
    <div className={styles.liveBoard}>
      <PointerSessionContext value={pointer}>
        <TableKeyboardContext value={keyboard}>
          <TabletopSessionProvider session={session}>
            <KeyboardBinding keyboard={keyboard} />
            <TabletopScene
              className={styles.liveScene}
              presentation="preview"
              stage="play"
              tableProgress={tableProgressFor(0)}
              onSceneReady={onReady}
              onSceneUnavailable={onUnavailable}
            />
          </TabletopSessionProvider>
        </TableKeyboardContext>
      </PointerSessionContext>
    </div>
  );
}
