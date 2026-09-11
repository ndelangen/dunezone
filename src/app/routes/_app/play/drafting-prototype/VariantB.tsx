/* PROTOTYPE (#1142) Variant B, "Browser": the table shows only the pooled result on the seat ring with an avatar strip; the panel is a faction list with Draft and Ban toggles and inline attribution. */
import { useState } from 'react';
import type { CSSProperties } from 'react';

import { bannedIds, bannersOf, factionById, gates, isBanned, me, pool, searchFactions } from './fixture';
import { Attribution, Avatar, Chips, FactionToken, GatesReadout, OpenSeat, ReadyButton } from './parts';
import type { VariantProps } from './parts';

function Overlay({ state }: VariantProps) {
  const poolIds = pool(state);
  const g = gates(state);
  const slots = Array.from({ length: state.seatCount }, (_, index) => poolIds[index] ?? null);
  const openSeats = Math.max(0, state.seatCount - state.players.length);
  return (
    <div className="dp-overlay dp-b">
      <div className="dp-b__strip" aria-label="Players">
        {state.players.map((player) => (
          <Avatar key={player.id} player={player} size={2.4} />
        ))}
        {Array.from({ length: openSeats }, (_, index) => (
          <OpenSeat key={`open-${index}`} size={2.4} />
        ))}
      </div>

      <div className="dp-b__ring" aria-label="Drafted pool on the seat ring">
        <span className="dp-b__map" />
        {slots.map((id, index) => {
          const angle = (index / state.seatCount) * Math.PI * 2 - Math.PI / 2;
          const style = { '--slot-x': `${50 + 42 * Math.cos(angle)}%`, '--slot-y': `${50 + 42 * Math.sin(angle)}%` } as CSSProperties;
          return (
            <span key={index} className={`dp-b__slot ${id ? '' : 'is-empty'}`} style={style}>
              {id ? (
                <>
                  <FactionToken faction={factionById(id)} size={3} />
                  <span className="dp-b__slot-name">{factionById(id).name}</span>
                  <Chips players={state.players.filter((player) => player.picks.includes(id))} />
                </>
              ) : (
                <>
                  <span className="dp-b__slot-empty">?</span>
                  <span className="dp-b__slot-name">{g.fillable > 0 ? 'random suitable' : 'nobody'}</span>
                </>
              )}
            </span>
          );
        })}
        <span className="dp-b__ring-note">Seats are dealt at random when everyone is ready</span>
      </div>

      <section className="dp-b__banned" aria-label="Banned factions">
        <h3>Banned</h3>
        <div>
          {bannedIds(state).map((id) => (
            <span key={id} className="dp-b__banned-item">
              <FactionToken faction={factionById(id)} banned size={1.9} />
              <Chips players={bannersOf(state, id)} />
            </span>
          ))}
          {bannedIds(state).length === 0 ? <span className="dp-empty">None</span> : null}
        </div>
      </section>

      <div className="dp-b__gates">
        <GatesReadout state={state} />
      </div>
    </div>
  );
}

function Panel({ state, dispatch }: VariantProps) {
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

export const VARIANT_B = { key: 'B' as const, name: 'Browser: faction list in the panel, pooled result on the seat ring', Overlay, Panel };
