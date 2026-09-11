/* PROTOTYPE (#1142, accepted as variant D): the drafting panel. A searchable, suitable-first faction list with Draft and Ban toggles, inline attribution and Ready. Throwaway; never merged. */
import { useState } from 'react';

import { factionById, isBanned, me, searchFactions } from './fixture';
import { Attribution, Chips, FactionToken, ReadyButton } from './parts';
import type { VariantProps } from './parts';

export function DraftingPanel({ state, dispatch }: VariantProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const current = me(state);
  const rows = searchFactions(query, showAll);
  return (
    <div className="dp-panel dp-b-panel">
      <div className="dp-toolbar">
        <input type="search" placeholder="Search factions" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search factions" />
        <label className="dp-check">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Show all factions
        </label>
        <span className="dp-b-panel__mine">
          Your draft: <Chips players={[]} />
          {current.picks.length ? current.picks.map((id) => factionById(id).name).join(', ') : 'nothing yet'}
          {current.bans.length ? ` · banned ${current.bans.map((id) => factionById(id).name).join(', ')}` : ''}
        </span>
        <ReadyButton state={state} dispatch={dispatch} />
      </div>
      <ul className="dp-list">
        {rows.map((faction) => {
          const banned = isBanned(state, faction.id);
          const picked = current.picks.includes(faction.id);
          const mine = current.bans.includes(faction.id);
          return (
            <li key={faction.id} className={`dp-list__row ${banned ? 'is-banned' : ''} ${picked ? 'is-picked' : ''}`}>
              <FactionToken faction={faction} banned={banned} highlighted={picked} size={2.2} />
              <span className="dp-list__name">
                {faction.name}
                <small>{!faction.eligible ? 'not generated' : faction.suitable ? 'suitable for this ruleset' : 'other faction'}</small>
              </span>
              <Attribution state={state} factionId={faction.id} />
              <span className="dp-list__actions">
                <button type="button" aria-pressed={picked} disabled={banned || !faction.eligible} onClick={() => dispatch({ type: picked ? 'unpick' : 'pick', faction: faction.id })}>
                  {picked ? 'Drafted ✓' : 'Draft'}
                </button>
                <button type="button" className="is-ban" aria-pressed={mine} onClick={() => dispatch({ type: mine ? 'unban' : 'ban', faction: faction.id })}>
                  {mine ? 'Banned ✓' : 'Ban'}
                </button>
              </span>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="dp-empty">No faction matches</li> : null}
      </ul>
    </div>
  );
}

