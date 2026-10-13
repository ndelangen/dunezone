import { HOMEPAGE_SOCKET_PATH } from '@shared/homepage/protocol';
import { tableProgressFor } from '@shared/play/phases';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import { lazy, Suspense, useCallback, useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { requestHomepageTicket } from '@db/homepage';
import type { GameRuntime } from '@db/tabletop/runtime';
import { TableSession } from '@db/tabletop/TableSession';
import { MapPreviewCamera } from '@app/widgets/tabletop/MapPreviewCamera';
import { useTableFraming } from '@app/widgets/tabletop/tableFraming';
import { TabletopBoard } from '@app/widgets/tabletop/TabletopBoard';
import { TabletopCanvas } from '@app/widgets/tabletop/TabletopCanvas';

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

const LiveControls = lazy(() => import('./LiveControls'));

export default function ConnectedTable({
  member,
  className,
  sceneClassName,
  onReady,
  onUnavailable,
}: {
  member: boolean;
  className: string;
  sceneClassName: string;
  onReady(): void;
  onUnavailable(): void;
}): ReactNode {
  const [session] = useState(
    () =>
      new TableSession('homepage', new HomepageSubscription(runtime, member ? requestHomepageTicket : null), runtime)
  );

  const [arrival, dispatch] = useReducer(
    (state: { painted: boolean; interactive: boolean }, event: 'painted' | 'interactive') => ({
      ...state,
      [event]: true,
    }),
    { painted: false, interactive: false }
  );
  const painted = useCallback(() => {
    dispatch('painted');
    onReady();
  }, [onReady]);
  const interactive = useCallback(() => dispatch('interactive'), []);
  const hasTable = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable() !== null,
    () => false
  );
  const stormSectorIndex = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable()?.state.stormSectorIndex,
    () => undefined
  );
  const { camera, tableProgress, trackerSlots } = useTableFraming(
    'play',
    tableProgressFor(0),
    DEFAULT_TABLE_SEAT_COUNT
  );
  useEffect(() => session.connect(), [session]);
  return (
    <div className={className} data-table-connected={arrival.interactive ? 'true' : undefined}>
      <div className={sceneClassName}>
        <TabletopCanvas
          camera={camera}
          presentation="preview"
          onSceneReady={painted}
          onSceneUnavailable={onUnavailable}
        >
          <MapPreviewCamera />
          <TabletopBoard
            stage="play"
            seatCount={DEFAULT_TABLE_SEAT_COUNT}
            tableProgress={tableProgress}
            trackerSlots={trackerSlots}
            stormSectorIndex={stormSectorIndex}
          />
          {arrival.painted && hasTable && (
            <Suspense fallback={null}>
              <LiveControls session={session} onReady={interactive} />
            </Suspense>
          )}
        </TabletopCanvas>
      </div>
    </div>
  );
}
