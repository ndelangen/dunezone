/* PROTOTYPE (#1142) Variant C, "Board-native": every faction sits as a token on a ring around the map; tapping a token drafts it, a small toggle bans it; attribution chips hang under each token; the panel is only search, Ready and a status line. */
import { useState } from 'react';
import type { CSSProperties } from 'react';

import { bannersOf, FACTIONS, gates, isBanned, me, pickersOf } from './fixture';
import { Avatar, Chips, FactionToken, GatesReadout, OpenSeat, ReadyButton } from './parts';
import type { VariantProps } from './parts';

type OverlayProps = VariantProps & { query: string };

function RingOverlay({ state, dispatch, query }: OverlayProps) {
  const current = me(state);
  const needle = query.trim().toLowerCase();
  const openSeats = Math.max(0, state.seatCount - state.players.length);
  return (
    <div className="dp-overlay dp-c">
      <div className="dp-c__players" aria-label="Players">
        {state.players.map((player) => (
          <Avatar key={player.id} player={player} size={2.3} />
        ))}
        {Array.from({ length: openSeats }, (_, index) => (
          <OpenSeat key={`open-${index}`} size={2.3} />
        ))}
      </div>

      <div className="dp-c__gates">
        <GatesReadout state={state} compact />
      </div>

      <div className="dp-c__ring" aria-label="Factions">
        <span className="dp-c__map" />
        {FACTIONS.map((faction, index) => {
          const angle = (index / FACTIONS.length) * Math.PI * 2 - Math.PI / 2;
          const style = { '--slot-x': `${50 + 44 * Math.cos(angle)}%`, '--slot-y': `${50 + 44 * Math.sin(angle)}%` } as CSSProperties;
          const banned = isBanned(state, faction.id);
          const picked = current.picks.includes(faction.id);
          const mine = current.bans.includes(faction.id);
          const matches = needle.length === 0 || faction.name.toLowerCase().includes(needle);
          return (
            <span key={faction.id} className={`dp-c__slot ${matches ? '' : 'is-dimmed'} ${banned ? 'is-banned' : ''}`} style={style}>
              <FactionToken
                faction={faction}
                size={2.9}
                banned={banned}
                highlighted={picked}
                dim={!matches}
                onClick={faction.eligible && !banned ? () => dispatch({ type: picked ? 'unpick' : 'pick', faction: faction.id }) : undefined}
                title={
                  !faction.eligible
                    ? `${faction.name} is not generated yet`
                    : banned
                      ? `${faction.name} is banned by ${bannersOf(state, faction.id)
                          .map((player) => player.name)
                          .join(', ')}`
                      : picked
                        ? `Remove ${faction.name} from your draft`
                        : `Draft ${faction.name}`
                }
              />
              <span className="dp-c__slot-name">{faction.name}</span>
              <span className="dp-c__slot-chips">
                <Chips players={pickersOf(state, faction.id)} size={0.95} />
                {banned ? <Chips players={bannersOf(state, faction.id)} size={0.95} /> : null}
              </span>
              <button
                type="button"
                className={`dp-c__ban ${mine ? 'is-on' : ''}`}
                aria-pressed={mine}
                title={mine ? `Remove your ban on ${faction.name}` : `Ban ${faction.name}`}
                onClick={() => dispatch({ type: mine ? 'unban' : 'ban', faction: faction.id })}
              >
                {mine ? 'unban' : 'ban'}
              </button>
            </span>
          );
        })}
      </div>

      <div className="dp-c__legend">
        <span>
          <span className="dp-legend-swatch dp-legend-swatch--picked" /> your draft
        </span>
        <span>
          <span className="dp-legend-swatch dp-legend-swatch--banned" /> banned
        </span>
        <span>
          <span className="dp-legend-swatch dp-legend-swatch--locked" /> not generated
        </span>
        <span>chips under a token show who drafted it</span>
      </div>
    </div>
  );
}

function StatusLine({ state }: VariantProps) {
  const g = gates(state);
  const current = me(state);
  return (
    <p className="dp-c-panel__status">
      {current.picks.length === 0 ? 'Tap a faction on the ring to draft it. ' : `You drafted ${current.picks.length}. `}
      {!g.rosterFull
        ? `${g.seatCount - g.seated} seat${g.seatCount - g.seated === 1 ? '' : 's'} still open.`
        : !g.enoughFactions
          ? 'The pool is short of factions.'
          : !g.allReady
            ? `${g.seated - g.ready} player${g.seated - g.ready === 1 ? '' : 's'} not ready yet.`
            : 'Everyone is ready; seats are being dealt.'}
    </p>
  );
}

/* Variant C keeps the search text in the panel and lets the overlay read it, so both halves are one component pair. */
export function useVariantCQuery() {
  return useState('');
}

function Panel({ state, dispatch, query, setQuery }: VariantProps & { query: string; setQuery: (value: string) => void }) {
  return (
    <div className="dp-panel dp-c-panel">
      <div className="dp-toolbar">
        <input type="search" placeholder="Find a faction on the ring" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search factions" />
        <ReadyButton state={state} dispatch={dispatch} />
      </div>
      <StatusLine state={state} dispatch={dispatch} />
    </div>
  );
}

export const VARIANT_C = { key: 'C' as const, name: 'Board-native: factions on the ring, tap to draft', Overlay: RingOverlay, Panel };
