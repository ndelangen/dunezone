/* PROTOTYPE (#1142) Variant A, "Ledger": the user's sketch. Per-player bans and picks beside each avatar; pooled zones at the edges; panel with banned and drafted areas around a searchable grid. */
import { useState } from 'react';

import { bannedIds, bannersOf, factionById, isBanned, me, pickersOf, pool, searchFactions } from './fixture';
import { Attribution, Avatar, Chips, FactionToken, GatesReadout, OpenSeat, ReadyButton } from './parts';
import type { VariantProps } from './parts';

function Overlay({ state, dispatch }: VariantProps) {
  const current = me(state);
  const openSeats = Math.max(0, state.seatCount - state.players.length);
  return (
    <div className="dp-overlay dp-a">
      <section className="dp-a__zone dp-a__zone--banned" aria-label="Banned factions">
        <h3>Banned</h3>
        <ul>
          {bannedIds(state).map((id) => (
            <li key={id}>
              <FactionToken faction={factionById(id)} banned size={2.2} />
              <span className="dp-a__zone-name">{factionById(id).name}</span>
              <Chips players={bannersOf(state, id)} />
            </li>
          ))}
          {bannedIds(state).length === 0 ? <li className="dp-empty">Nobody has banned a faction</li> : null}
        </ul>
      </section>

      <section className="dp-a__ledger" aria-label="Players">
        <GatesReadout state={state} />
        <ol>
          {state.players.map((player) => (
            <li key={player.id} className={player.id === current.id ? 'is-me' : ''}>
              <span className="dp-a__side dp-a__side--bans">
                {player.bans.map((id) => (
                  <FactionToken
                    key={id}
                    faction={factionById(id)}
                    banned
                    size={1.7}
                    onClick={player.id === current.id ? () => dispatch({ type: 'unban', faction: id }) : undefined}
                    title={player.id === current.id ? `Remove your ban on ${factionById(id).name}` : `${player.name} banned ${factionById(id).name}`}
                  />
                ))}
              </span>
              <Avatar player={player} />
              <span className="dp-a__side dp-a__side--picks">
                {player.picks.map((id) => (
                  <FactionToken
                    key={id}
                    faction={factionById(id)}
                    size={1.7}
                    dim={isBanned(state, id)}
                    onClick={player.id === current.id ? () => dispatch({ type: 'unpick', faction: id }) : undefined}
                    title={player.id === current.id ? `Remove ${factionById(id).name} from your draft` : `${player.name} drafted ${factionById(id).name}`}
                  />
                ))}
              </span>
            </li>
          ))}
          {Array.from({ length: openSeats }, (_, index) => (
            <li key={`open-${index}`} className="is-open">
              <span className="dp-a__side" />
              <OpenSeat />
              <span className="dp-a__side" />
            </li>
          ))}
        </ol>
      </section>

      <section className="dp-a__zone dp-a__zone--drafted" aria-label="Drafted factions">
        <h3>Drafted</h3>
        <ul>
          {pool(state).map((id) => (
            <li key={id}>
              <FactionToken faction={factionById(id)} size={2.2} />
              <span className="dp-a__zone-name">{factionById(id).name}</span>
              <Chips players={pickersOf(state, id)} />
            </li>
          ))}
          {pool(state).length === 0 ? <li className="dp-empty">Nobody has drafted a faction</li> : null}
        </ul>
      </section>
    </div>
  );
}

function Panel({ state, dispatch }: VariantProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(true);
  const current = me(state);
  return (
    <div className="dp-panel dp-a-panel">
      <section className="dp-a-panel__zone" aria-label="Your bans">
        <h3>Banned</h3>
        <div className="dp-a-panel__tokens">
          {current.bans.map((id) => (
            <FactionToken key={id} faction={factionById(id)} banned onClick={() => dispatch({ type: 'unban', faction: id })} title={`Remove your ban on ${factionById(id).name}`} />
          ))}
          {current.bans.length === 0 ? <span className="dp-empty">Ban a faction from the list</span> : null}
        </div>
      </section>

      <section className="dp-a-panel__browse" aria-label="Factions">
        <div className="dp-toolbar">
          <input type="search" placeholder="Search factions" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search factions" />
          <label className="dp-check">
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Show all factions
          </label>
          <ReadyButton state={state} dispatch={dispatch} />
        </div>
        <div className="dp-grid">
          {searchFactions(query, showAll).map((faction) => {
            const banned = isBanned(state, faction.id);
            const picked = current.picks.includes(faction.id);
            const mine = current.bans.includes(faction.id);
            return (
              <div key={faction.id} className={`dp-grid__cell ${banned ? 'is-banned' : ''} ${picked ? 'is-picked' : ''}`}>
                <FactionToken faction={faction} banned={banned} highlighted={picked} size={2.6} />
                <span className="dp-grid__name">
                  {faction.name}
                  {!faction.suitable ? <em> other</em> : null}
                  {!faction.eligible ? <em> not generated</em> : null}
                </span>
                <Attribution state={state} factionId={faction.id} />
                <span className="dp-grid__actions">
                  <button type="button" disabled={banned || !faction.eligible} onClick={() => dispatch({ type: picked ? 'unpick' : 'pick', faction: faction.id })}>
                    {picked ? 'Undraft' : 'Draft'}
                  </button>
                  <button type="button" className="is-ban" onClick={() => dispatch({ type: mine ? 'unban' : 'ban', faction: faction.id })}>
                    {mine ? 'Unban' : 'Ban'}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dp-a-panel__zone" aria-label="Your draft">
        <h3>Drafted</h3>
        <div className="dp-a-panel__tokens">
          {current.picks.map((id) => (
            <FactionToken key={id} faction={factionById(id)} dim={isBanned(state, id)} onClick={() => dispatch({ type: 'unpick', faction: id })} title={`Remove ${factionById(id).name} from your draft`} />
          ))}
          {current.picks.length === 0 ? <span className="dp-empty">Draft a faction from the list</span> : null}
        </div>
      </section>
    </div>
  );
}

export const VARIANT_A = { key: 'A' as const, name: 'Ledger: per-player bans and picks beside each avatar', Overlay, Panel };
