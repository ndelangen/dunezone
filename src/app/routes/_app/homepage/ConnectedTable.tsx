import { HOMEPAGE_SOCKET_PATH } from '@shared/homepage/protocol';
import { lastTurnOf } from '@shared/play/lastTurn';
import { tableProgressFor } from '@shared/play/phases';
import { setupMapVisible } from '@shared/play/setup';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
  useSyncExternalStore,
} from 'react';
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
  identity,
  className,
  sceneClassName,
  onReady,
  onUnavailable,
}: {
  identity: string | null;
  className: string;
  sceneClassName: string;
  onReady(): void;
  onUnavailable(): void;
}): ReactNode {
  const [subscription] = useState(() => new HomepageSubscription(runtime, null));
  const [session] = useState(() => new TableSession('homepage', subscription, runtime));
  useLayoutEffect(() => {
    subscription.setViewer(identity, identity ? requestHomepageTicket : null);
  }, [identity, subscription]);

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
  const snapshot = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable()?.snapshot ?? null,
    () => null
  );
  const stormSectorIndex = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable()?.state.stormSectorIndex,
    () => undefined
  );
  const stage = snapshot?.stage;
  const seatCount = snapshot?.roster?.seatCount ?? DEFAULT_TABLE_SEAT_COUNT;
  const mapVisible = setupMapVisible(snapshot?.setup);
  const { camera, tableProgress, trackerSlots, mapFramingPoints } = useTableFraming(
    stage,
    { ...tableProgressFor(snapshot?.phase ?? 0, snapshot?.phases), lastTurn: lastTurnOf(snapshot ?? {}) },
    seatCount
  );
  useEffect(() => session.connect(), [session]);
  return (
    <div
      className={className}
      data-table-connected={arrival.interactive ? 'true' : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        if (session.getTable()?.state.draftMove) {
          session.takeAdditionalFromTarget();
        }
      }}
    >
      <div className={sceneClassName}>
        <TabletopCanvas
          camera={camera}
          presentation="preview"
          onSceneReady={painted}
          onSceneUnavailable={onUnavailable}
        >
          <MapPreviewCamera mapFramingPoints={mapFramingPoints} />
          <TabletopBoard
            board={snapshot?.board}
            stage={stage}
            mapVisible={mapVisible}
            seatCount={seatCount}
            tableProgress={tableProgress}
            trackerSlots={trackerSlots}
            stormSectorIndex={stormSectorIndex}
            onClick={arrival.interactive ? () => session.selectPiece(null) : undefined}
          />
          {arrival.painted && snapshot && (
            <Suspense fallback={null}>
              <LiveControls
                session={session}
                onReady={interactive}
                scene={{ stage, mapVisible, seatCount, tableProgress, trackerSlots, mapFramingPoints }}
              />
            </Suspense>
          )}
        </TabletopCanvas>
      </div>
    </div>
  );
}
