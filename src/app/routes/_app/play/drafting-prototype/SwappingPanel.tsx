/* PROTOTYPE (#1143, accepted as variant E): the swapping panel. A seat card for the dealt faction with the countdown and swap-ready control, above a roster of seats with the one action that applies to each. Throwaway; never merged. */
import type { CSSProperties } from 'react';

import { Chips, FactionToken } from './parts';
import { formatClock, mySeat, offerFrom, offersTo, seatFaction, swapGates } from './swapping';
import type { SwapAction, SwapState, Seat } from './swapping';

export type SwapProps = { state: SwapState; dispatch: (action: SwapAction) => void };

function ReadyControl({ state, dispatch }: SwapProps) {
  const me = mySeat(state);
  const ready = me.player?.ready ?? false;
  return (
    <button type="button" className={`button ${ready ? 'button--quiet' : 'button--primary'} dp-ready`} aria-pressed={ready} onClick={() => dispatch({ type: 'toggleReady' })}>
      {ready ? 'Swap-ready ✓ (withdraw)' : 'Ready to start'}
    </button>
  );
}

function SeatAction({ state, dispatch, seat }: SwapProps & { seat: Seat }) {
  const me = mySeat(state);
  if (seat.index === me.index) {
    return <span className="dp-swap-action dp-swap-action--self">your seat</span>;
  }
  const frozen = me.player?.ready ?? false;
  const incoming = offersTo(state, me.index).some((offer) => offer.from === seat.index);
  const outgoing = offerFrom(state, me.index)?.to === seat.index;
  if (incoming) {
    return (
      <button type="button" className="dp-swap-action is-accept" disabled={frozen} onClick={() => dispatch({ type: 'accept', from: seat.index })}>
        Accept trade
      </button>
    );
  }
  if (outgoing) {
    return (
      <button type="button" className="dp-swap-action is-cancel" onClick={() => dispatch({ type: 'cancelOffer' })}>
        Cancel offer
      </button>
    );
  }
  if (!seat.player) {
    return (
      <button type="button" className="dp-swap-action" disabled={frozen} onClick={() => dispatch({ type: 'offer', to: seat.index })}>
        Move here
      </button>
    );
  }
  return (
    <button type="button" className="dp-swap-action" disabled={frozen || seat.player.ready} title={seat.player.ready ? `${seat.player.name} is ready and no longer trades` : undefined} onClick={() => dispatch({ type: 'offer', to: seat.index })}>
      Offer trade
    </button>
  );
}

export function SwappingPanel({ state, dispatch }: SwapProps) {
  const me = mySeat(state);
  const faction = seatFaction(me);
  const g = swapGates(state);
  return (
    <div className="dp-panel dp-e">
      <section className="dp-e__card" style={{ '--token-colour': faction.colour } as CSSProperties}>
        <FactionToken faction={faction} size={4.2} highlighted />
        <span className="dp-e__card-copy">
          <span className="eyebrow">You were dealt</span>
          <strong>{faction.name}</strong>
          <small>Seat {me.index + 1} of {state.seats.length}. Offer a trade below, or ready up to keep it.</small>
        </span>
        <span className="dp-e__card-side">
          <span className="dp-e__clock">{formatClock(state.secondsLeft)}</span>
          <ReadyControl state={state} dispatch={dispatch} />
        </span>
      </section>
      <ol className="dp-e__roster" aria-label="Seats and players">
        {state.seats.map((seat) => {
          const f = seatFaction(seat);
          const incoming = offersTo(state, me.index).some((offer) => offer.from === seat.index);
          return (
            <li key={seat.index} className={`${seat.index === me.index ? 'is-me' : ''} ${incoming ? 'has-offer' : ''}`}>
              <span className="dp-e__seat">{seat.index + 1}</span>
              <FactionToken faction={f} size={2.1} />
              <span className="dp-e__faction">{f.name}</span>
              <span className="dp-e__pair" aria-hidden="true">
                ⇄
              </span>
              <span className="dp-e__player">
                {seat.player ? (
                  <>
                    <Chips players={[seat.player]} size={1.3} /> {seat.player.name}
                    {seat.player.ready ? <i> ready</i> : null}
                  </>
                ) : (
                  <em>open seat</em>
                )}
              </span>
              <SeatAction state={state} dispatch={dispatch} seat={seat} />
            </li>
          );
        })}
      </ol>
      <p className="dp-swap__status">
        Swap-ready {g.ready} of {g.seated}. {g.vacancies ? `${g.vacancies} seat waits for a player. ` : ''}
        Trading ends at 0:00; then setup begins with the seats as they stand.
      </p>
      <p className="dp-swap__sr">
        {state.offers.length === 0
          ? 'No open offers.'
          : state.offers
              .map((offer) => {
                const from = seatFaction(state.seats[offer.from]).name;
                const to = seatFaction(state.seats[offer.to]).name;
                return `${from}${offer.from === me.index ? ' (you)' : ''} offers to trade with ${to}${offer.to === me.index ? ' (you)' : ''}.`;
              })
              .join(' ')}
      </p>
    </div>
  );
}

