import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { useReducer } from 'react';
import type { CSSProperties } from 'react';

import { AuctionTracker } from '@app/widgets/treachery-tracker/AuctionTracker';
import { trackerReducer } from '@app/widgets/treachery-tracker/tracker';
import type { TrackerState } from '@app/widgets/treachery-tracker/tracker';
import { FACTIONS } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import compassStyles from '../../compass/CompassControls.module.css';
import { PanelFrame } from '../../compass/PanelFrame';
import type { CompassPanel } from '../../compass/panels';
import '../../table/dune-play.css';

const TRACKER_PANEL: Omit<CompassPanel, 'content'> = {
  key: 'treachery-tracker',
  label: 'Treachery tracker',
  group: 'Table',
  topic: 'cards',
  description: 'Track the Treachery cards that come up for bid, and who holds them. Only you see it.',
  layout: 'stack',
};

/** The tracker as a pinned compass slot shows it, live: its own panel and title. */
export function TrackerPanelFrame({ initial }: Readonly<{ initial: () => TrackerState }>) {
  const [state, dispatch] = useReducer(trackerReducer, undefined, initial);
  return (
    <DarkSchemeIsland>
      <div
        className="dune-play-shell"
        {...darkSchemeIslandAttributes}
        style={{ width: 'calc(400px + 24px)', height: '100vh' }}
      >
        <div className={compassStyles.root} style={{ '--slot-width': '400px' } as CSSProperties}>
          <PanelFrame
            entry={{
              ...TRACKER_PANEL,
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
