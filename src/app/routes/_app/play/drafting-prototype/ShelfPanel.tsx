/* PROTOTYPE (#1145, variant "shelf"): your seat, drafted and banned tokens, the note and Ready on one shelf, above a grid of faction tiles that uses the panel's width. Throwaway; never merged. */
import { StatusBadge } from '@ui/content/StatusBadge';
import { useState } from 'react';

import { factionById, gates, isBanned, me, searchFactions } from './fixture';
import type { Faction } from './fixture';
import { DraftBanToggles, DraftNote, SearchTools, SeatBar, seatLabel } from './panelParts';
import { Attribution, Avatar, FactionToken, OpenSeat, ReadyButton } from './parts';
import type { VariantProps } from './parts';

function FactionTile({ state, dispatch, faction }: VariantProps & { faction: Faction }) {
  const current = me(state);
  const banned = isBanned(state, faction.id);
  const picked = current?.picks.includes(faction.id) ?? false;
  return (
    <div className={`dp-h__tile ${banned ? 'is-banned' : ''} ${picked ? 'is-picked' : ''}`}>
      <FactionToken faction={faction} banned={banned} highlighted={picked} size={3.2} />
      <span className="dp-h__tile-name">{faction.name}</span>
      <StatusBadge tone={!faction.eligible ? 'negative' : faction.suitable ? 'positive' : 'neutral'}>
        {!faction.eligible ? 'not generated' : faction.suitable ? 'suitable' : 'other'}
      </StatusBadge>
      {faction.blocked ? <small>{faction.blocked}</small> : null}
      <Attribution state={state} factionId={faction.id} />
      <DraftBanToggles state={state} dispatch={dispatch} faction={faction} />
    </div>
  );
}

export function ShelfPanel({ state, dispatch }: VariantProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const current = me(state);
  const g = gates(state);
  const rows = searchFactions(query, showAll);
  return (
    <div className="dp-panel dp-h">
      <SeatBar state={state} dispatch={dispatch} />
      <div className="dp-h__shelf">
        {current ? <Avatar player={current} size={2.4} label={false} /> : <OpenSeat size={2.4} label={false} />}
        <span className="dp-h__seat">
          <strong>{seatLabel(state)}</strong>
          <small>
            {g.seated} seated, {g.ready} ready
          </small>
        </span>
        {current ? (
          <>
            <span className="dp-h__group">
              <span className="dp-h__label">Drafted</span>
              {current.picks.map((id) => (
                <FactionToken key={id} faction={factionById(id)} size={2} highlighted title={`Remove ${factionById(id).name} from your draft`} onClick={() => dispatch({ type: 'unpick', faction: id })} />
              ))}
              {current.picks.length === 0 ? <span className="dp-empty">none</span> : null}
            </span>
            <span className="dp-h__group dp-h__group--ban">
              <span className="dp-h__label">Banned</span>
              {current.bans.map((id) => (
                <FactionToken key={id} faction={factionById(id)} size={2} banned title={`Remove your ban on ${factionById(id).name}`} onClick={() => dispatch({ type: 'unban', faction: id })} />
              ))}
              {current.bans.length === 0 ? <span className="dp-empty">none</span> : null}
            </span>
          </>
        ) : (
          <p className="dp-hint">You see every pick and ban but hold none.</p>
        )}
        {state.players.length === 1 ? <p className="dp-hint">Seated alone. Share the game link; players request a seat and you approve them here.</p> : null}
        <DraftNote state={state} />
        {current ? <ReadyButton state={state} dispatch={dispatch} /> : null}
      </div>
      <SearchTools query={query} showAll={showAll} onQuery={setQuery} onShowAll={setShowAll}>
        <span className="dp-check">
          {rows.length} of {searchFactions('', true).length} factions
        </span>
      </SearchTools>
      {/* TileGrid was tried first: its 9.5rem catalogue track gives six tiles per row at 1440 wide; the panel's own grid fits eight. */}
      <div className="dp-h__grid">
        {rows.map((faction) => (
          <FactionTile key={faction.id} state={state} dispatch={dispatch} faction={faction} />
        ))}
      </div>
      {rows.length === 0 ? <p className="dp-empty">No faction matches</p> : null}
    </div>
  );
}
