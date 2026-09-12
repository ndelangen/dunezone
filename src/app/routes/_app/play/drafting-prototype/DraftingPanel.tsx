/* PROTOTYPE (#1142, accepted as variant D; #1145 adds the seat bar, the #1010 note and the spectator rule): the drafting panel. A searchable, suitable-first faction list with Draft and Ban toggles, inline attribution and Ready; a spectator sees the bar and nothing else. Throwaway; never merged. */
import { useState } from 'react';

import { factionById, me, searchFactions } from './fixture';
import { DraftNote, FactionRow, SearchTools, SeatBar } from './panelParts';
import { ReadyButton } from './parts';
import type { VariantProps } from './parts';

export function DraftingPanel({ state, dispatch }: VariantProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const current = me(state);
  const rows = searchFactions(query, showAll);
  return (
    <div className="dp-panel dp-b-panel">
      <SeatBar state={state} dispatch={dispatch} />
      {current ? (
        <>
          <SearchTools query={query} showAll={showAll} onQuery={setQuery} onShowAll={setShowAll}>
            <span className="dp-b-panel__mine">
              Your draft: {current.picks.length ? current.picks.map((id) => factionById(id).name).join(', ') : 'nothing yet'}
              {current.bans.length ? `; banned ${current.bans.map((id) => factionById(id).name).join(', ')}` : ''}
            </span>
            <ReadyButton state={state} dispatch={dispatch} />
          </SearchTools>
          {state.players.length === 1 ? <p className="dp-hint">You are seated alone. Share the game link; players request a seat and you approve them here.</p> : null}
          <DraftNote state={state} />
          <ul className="dp-list">
            {rows.map((faction) => (
              <FactionRow key={faction.id} state={state} dispatch={dispatch} faction={faction} />
            ))}
            {rows.length === 0 ? <li className="dp-empty">No faction matches</li> : null}
          </ul>
        </>
      ) : null}
    </div>
  );
}
