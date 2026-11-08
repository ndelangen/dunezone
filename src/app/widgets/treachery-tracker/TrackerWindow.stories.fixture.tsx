import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { useReducer } from 'react';
import type { CSSProperties } from 'react';

import compassStyles from '../../routes/_app/play/compass/CompassControls.module.css';
import { WindowFrame } from '../../routes/_app/play/compass/WindowFrame';
import type { TableWindow } from '../../routes/_app/play/compass/windows';
import { AuctionTracker } from './AuctionTracker';
import { trackerReducer } from './tracker';
import type { TrackerState } from './tracker';
import { FACTIONS } from './tracker.stories.fixture';
import '../../routes/_app/play/dune-play.css';

const TRACKER_WINDOW: Omit<TableWindow, 'content'> = {
  key: 'treachery-tracker',
  label: 'Treachery tracker',
  group: 'Table',
  topic: 'cards',
  description: 'Track the Treachery cards that come up for bid, and who holds them. Only you see it.',
  layout: 'stack',
};

/** The tracker as a pinned compass slot shows it, live: its own window and title. */
export function TrackerWindow({ initial }: Readonly<{ initial: () => TrackerState }>) {
  const [state, dispatch] = useReducer(trackerReducer, undefined, initial);
  return (
    <DarkSchemeIsland>
      <div
        className="dune-play-shell"
        {...darkSchemeIslandAttributes}
        style={{ width: 'calc(400px + 24px)', height: '100vh' }}
      >
        <div className={compassStyles.root} style={{ '--slot-width': '400px' } as CSSProperties}>
          <WindowFrame
            entry={{
              ...TRACKER_WINDOW,
              content: <AuctionTracker factions={FACTIONS} state={state} onAction={dispatch} />,
            }}
            where="left"
            inert={false}
            style={{ height: 'calc(100vh - 24px)' }}
            onSeat={() => undefined}
            onFaction={() => undefined}
            actions={null}
          />
        </div>
      </div>
    </DarkSchemeIsland>
  );
}
