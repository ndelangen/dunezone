import { Tooltip } from '@mantine/core';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { Settings2 } from 'lucide-react';
import { useReducer, useState } from 'react';
import type { CSSProperties } from 'react';

import compassStyles from '../../routes/_app/play/compass/CompassControls.module.css';
import { WindowFrame } from '../../routes/_app/play/compass/WindowFrame';
import type { TableWindow } from '../../routes/_app/play/compass/windows';
import { AuctionTracker } from './AuctionTracker';
import { trackerReducer } from './tracker';
import type { TrackerState } from './tracker';
import { FACTIONS } from './tracker.stories.fixture';
import { TrackerConfigPanel } from './TrackerConfig';
import type { TrackerConfig } from './TrackerConfig';
import '../../routes/_app/play/dune-play.css';

const TRACKER_WINDOW: Omit<TableWindow, 'content'> = {
  key: 'treachery-tracker',
  label: 'Treachery tracker',
  group: 'Table',
  topic: 'cards',
  description: 'Track the Treachery cards that come up for bid, and who holds them. Only you see it.',
  layout: 'stack',
};

/* The deck list the standalone tracker offers; the catalogue supplies it, and the stories carry the one deck they have art for. */
const DECKS = [{ id: 'dreamrules', name: 'Dreamrules Treachery Deck' }];

/**
 * The tracker as a pinned compass slot shows it, live: its own window and title, with the config gear in the title bar.
 * The gear turns the window to config mode (deck, factions, seat order) and back.
 */
export function TrackerWindow({
  initial,
  configuring = false,
}: Readonly<{ initial: () => TrackerState; configuring?: boolean }>) {
  const [state, dispatch] = useReducer(trackerReducer, undefined, initial);
  const [config, setConfig] = useState<TrackerConfig>({
    deck: 'dreamrules',
    order: FACTIONS.map((faction) => faction.id),
    playing: FACTIONS.map((faction) => faction.id),
  });
  const [inConfig, setInConfig] = useState(configuring);
  const factions = config.order
    .filter((id) => config.playing.includes(id))
    .map((id) => FACTIONS.find((faction) => faction.id === id)!);
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
              content: inConfig ? (
                <TrackerConfigPanel decks={DECKS} factions={FACTIONS} config={config} onChange={setConfig} />
              ) : (
                <AuctionTracker factions={factions} state={state} onAction={dispatch} />
              ),
            }}
            where="left"
            inert={false}
            style={{ height: 'calc(100vh - 24px)' }}
            onSeat={() => undefined}
            onFaction={() => undefined}
            actions={
              <Tooltip label={inConfig ? 'Back to the tracker' : 'Set the deck and the factions'} withArrow>
                <button
                  type="button"
                  className={compassStyles.iconButton}
                  aria-pressed={inConfig}
                  aria-label="Configure the tracker"
                  onClick={() => setInConfig((was) => !was)}
                >
                  <Settings2 size={16} />
                </button>
              </Tooltip>
            }
          />
        </div>
      </div>
    </DarkSchemeIsland>
  );
}
