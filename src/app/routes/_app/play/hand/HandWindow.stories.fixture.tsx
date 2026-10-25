import { useContext, useEffect, useState, useSyncExternalStore } from 'react';

import { TableSession } from '../../../../db/tabletop/TableSession';
import compass from '../compass/CompassControls.module.css';
import { WindowFrame } from '../compass/WindowFrame';
import { DarkSchemeIsland } from '../DarkSchemeIsland';
import { GameRuntimeContext } from '../multiplayer/gameRuntime';
import { GameSubscription } from '../multiplayer/GameSubscription';
import { HiddenZone } from '../multiplayer/HiddenZone';
import { HIDDEN_ZONE_GUIDANCE } from '../multiplayer/panelGuidance';
import { HandShelves } from './HandShelves';
import { SpiceReserve } from './SpiceReserve';
import '../dune-play.css';

/*
 * The Hand & spice window on its own: a live table session from the story's transport, and the window in a bottom-left slot
 * on the table's dark ground, as the compass composes it, without the table itself. The real Private side-table window
 * sits bottom right, so a piece set aside is seen arriving; the Play debugger panel shows the room's state for the rest.
 */
export function HandWindowHarness({ height = 448 }: Readonly<{ height?: number; seat?: string }>) {
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
                content: (
                  <>
                    <SpiceReserve client={client} table={table} />
                    <HandShelves client={client} table={table} hand={hand} />
                  </>
                ),
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
                key: 'hidden-zone',
                label: 'Private side-table',
                group: 'Yours',
                topic: 'hiddenZone',
                ...HIDDEN_ZONE_GUIDANCE,
                content: <HiddenZone client={client} table={table} hand={hand} />,
                layout: 'flush',
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
