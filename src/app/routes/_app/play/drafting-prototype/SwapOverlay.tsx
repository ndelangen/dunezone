/* PROTOTYPE (#1143): the shared table overlay for swapping: faction tokens at the seat stations, offer arrows, countdown, no player avatars. */
import { useEffect } from 'react';
import type { CSSProperties } from 'react';

import { FactionToken } from './parts';
import { formatClock, mySeat, seatFaction, swapGates } from './swapping';
import type { SwapAction, SwapState } from './swapping';

export type SwapProps = { state: SwapState; dispatch: (action: SwapAction) => void };

const RADIUS = 40;

function stationPosition(index: number, count: number) {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + RADIUS * Math.cos(angle), y: 50 + RADIUS * Math.sin(angle) };
}

export function SwapOverlay({ state, dispatch }: SwapProps) {
  const me = mySeat(state);
  const g = swapGates(state);
  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => window.clearInterval(id);
  }, [dispatch]);
  return (
    <div className="dp-overlay dp-swap">
      <div className="dp-swap__ring" aria-label="Seats">
        <svg className="dp-swap__arrows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="dp-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          {state.offers.map((offer) => {
            const a = stationPosition(offer.from, state.seats.length);
            const b = stationPosition(offer.to, state.seats.length);
            const colour = seatFaction(state.seats[offer.from]).colour;
            const shrink = 7;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const x1 = a.x + (dx / len) * shrink;
            const y1 = a.y + (dy / len) * shrink;
            const x2 = b.x - (dx / len) * shrink;
            const y2 = b.y - (dy / len) * shrink;
            return (
              <line
                key={`${offer.from}-${offer.to}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={colour}
                strokeWidth={offer.to === me.index ? 1.6 : 1}
                strokeDasharray={offer.from === me.index ? '2 1.4' : undefined}
                markerEnd="url(#dp-arrowhead)"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <span className="dp-swap__clock">
          <strong>{formatClock(state.secondsLeft)}</strong>
          <small>to trade seats</small>
          <em>
            Swap-ready {g.ready}/{g.seated}
            {g.vacancies ? ` · ${g.vacancies} open seat` : ''}
          </em>
        </span>
        {state.seats.map((seat) => {
          const p = stationPosition(seat.index, state.seats.length);
          const style = { '--slot-x': `${p.x}%`, '--slot-y': `${p.y}%` } as CSSProperties;
          const faction = seatFaction(seat);
          const isMe = seat.index === me.index;
          return (
            <span key={seat.index} className={`dp-swap__station ${isMe ? 'is-me' : ''} ${seat.player ? '' : 'is-open'}`} style={style}>
              <FactionToken faction={faction} size={3.4} highlighted={isMe} dim={!seat.player} />
              <span className="dp-swap__station-name">
                {faction.name}
                {isMe ? <b> you</b> : null}
                {!seat.player ? <b> open</b> : null}
                {seat.player?.ready ? <i title="swap-ready"> ✓</i> : null}
              </span>
            </span>
          );
        })}
      </div>
      <p className="dp-swap__sr">
        {state.offers.length === 0
          ? 'No open offers.'
          : state.offers
              .map(
                (offer) =>
                  `${state.seats[offer.from].player?.name ?? 'Open seat'} (${seatFaction(state.seats[offer.from]).name}) offers to trade with ${
                    state.seats[offer.to].player?.name ?? 'the open seat'
                  } (${seatFaction(state.seats[offer.to]).name}).`
              )
              .join(' ')}
      </p>
    </div>
  );
}
