/* PROTOTYPE (#1145, variant "sidecar"): your seat, draft, bans, note and Ready in a sidecar beside the faction list; the seat bar spans both. Throwaway; never merged. */
import { useState } from 'react';

import { factionById, gates, me, searchFactions } from './fixture';
import { DraftNote, FactionRow, SearchTools, SeatBar, seatLabel } from './panelParts';
import { Avatar, FactionToken, OpenSeat, ReadyButton } from './parts';
import type { VariantProps } from './parts';

export function SidecarPanel({ state, dispatch }: VariantProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const current = me(state);
  const g = gates(state);
  const open = g.seatCount - g.seated;
  const rows = searchFactions(query, showAll);
  return (
    <div className="dp-panel dp-s">
      <SeatBar state={state} dispatch={dispatch} />
      <div className="dp-s__body">
        <aside className="dp-s__you" aria-label="Your seat">
          <div className="dp-s__seat">
            {current ? <Avatar player={current} size={3} label={false} /> : <OpenSeat size={3} label={false} />}
            <span>
              <strong>{seatLabel(state)}</strong>
              <small>
                {g.seated} seated, {open} open
              </small>
            </span>
          </div>
          {current ? (
            <>
              <h3>Your draft</h3>
              <div className="dp-s__tokens">
                {current.picks.map((id) => (
                  <FactionToken key={id} faction={factionById(id)} size={2} highlighted title={`Remove ${factionById(id).name} from your draft`} onClick={() => dispatch({ type: 'unpick', faction: id })} />
                ))}
                {current.picks.length === 0 ? <span className="dp-empty">Nothing yet. Draft from the list.</span> : null}
              </div>
              <h3>Your bans</h3>
              <div className="dp-s__tokens">
                {current.bans.map((id) => (
                  <FactionToken key={id} faction={factionById(id)} size={2} banned title={`Remove your ban on ${factionById(id).name}`} onClick={() => dispatch({ type: 'unban', faction: id })} />
                ))}
                {current.bans.length === 0 ? <span className="dp-empty">None.</span> : null}
              </div>
              {state.players.length === 1 ? <p className="dp-hint">You are seated alone. Share the game link; players request a seat and you approve them here.</p> : null}
              <DraftNote state={state} />
              <ReadyButton state={state} dispatch={dispatch} />
              <span className="dp-s__count">
                Ready {g.ready} of {g.seated}
              </span>
            </>
          ) : (
            <>
              <p className="dp-hint">You see every pick and ban but hold none. Request a seat above to draft.</p>
              <DraftNote state={state} />
              <span className="dp-s__count">
                Ready {g.ready} of {g.seated}
              </span>
            </>
          )}
        </aside>
        <section className="dp-s__browse" aria-label="Factions">
          <SearchTools query={query} showAll={showAll} onQuery={setQuery} onShowAll={setShowAll} />
          <ul className="dp-list">
            {rows.map((faction) => (
              <FactionRow key={faction.id} state={state} dispatch={dispatch} faction={faction} />
            ))}
            {rows.length === 0 ? <li className="dp-empty">No faction matches</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
