/* PROTOTYPE (#1143): three panels for the swapping phase. Each shows the player and faction pairing and the trade controls differently. */
import type { CSSProperties } from 'react';
import { Chips, FactionToken } from './parts';
import { formatClock, mySeat, offerFrom, offersTo, seatFaction, swapGates } from './swapping';
import type { SwapAction, SwapState, Seat } from './swapping';
import type { SwapProps } from './SwapOverlay';

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

/* E: a seat card for the current player above a roster of pairings in seat order. */
function PanelE({ state, dispatch }: SwapProps) {
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
    </div>
  );
}

/* F: the six factions as a strip in seat order, mirroring the table; the player's name sits under each token; tap a token to trade. */
function PanelF({ state, dispatch }: SwapProps) {
  const me = mySeat(state);
  const g = swapGates(state);
  return (
    <div className="dp-panel dp-f">
      <div className="dp-toolbar">
        <span className="dp-f__lead">
          You play <strong>{seatFaction(me).name}</strong>. Tap another faction to offer a trade.
        </span>
        <span className="dp-e__clock">{formatClock(state.secondsLeft)}</span>
        <ReadyControl state={state} dispatch={dispatch} />
      </div>
      <div className="dp-f__strip" role="list" aria-label="Seats in table order">
        {state.seats.map((seat) => {
          const f = seatFaction(seat);
          const isMe = seat.index === me.index;
          const incoming = offersTo(state, me.index).some((offer) => offer.from === seat.index);
          const outgoing = offerFrom(state, me.index)?.to === seat.index;
          const theirOffer = offerFrom(state, seat.index);
          return (
            <div key={seat.index} role="listitem" className={`dp-f__cell ${isMe ? 'is-me' : ''} ${incoming ? 'has-offer' : ''} ${outgoing ? 'is-target' : ''}`}>
              <FactionToken faction={f} size={3.6} highlighted={isMe} dim={!seat.player} />
              <span className="dp-f__faction">{f.name}</span>
              <span className="dp-f__player">
                {seat.player ? (
                  <>
                    {isMe ? 'You' : seat.player.name}
                    {seat.player.ready ? <i> ✓</i> : null}
                  </>
                ) : (
                  <em>open</em>
                )}
              </span>
              {theirOffer && !isMe ? (
                <span className="dp-f__note">offers {seatFaction(state.seats[theirOffer.to]).name}</span>
              ) : null}
              <SeatAction state={state} dispatch={dispatch} seat={seat} />
            </div>
          );
        })}
      </div>
      <p className="dp-swap__status">
        Swap-ready {g.ready} of {g.seated}. Ready players stop trading; the last ready player or the clock ends the phase.
      </p>
    </div>
  );
}

/* G: a trade board with three columns: your faction, offers on the table, and a proposal list. */
function PanelG({ state, dispatch }: SwapProps) {
  const me = mySeat(state);
  const faction = seatFaction(me);
  const incoming = offersTo(state, me.index);
  const outgoing = offerFrom(state, me.index);
  return (
    <div className="dp-panel dp-g">
      <section className="dp-g__you">
        <span className="eyebrow">Your faction</span>
        <FactionToken faction={faction} size={3.8} highlighted />
        <strong>{faction.name}</strong>
        <small>seat {me.index + 1}</small>
        <span className="dp-e__clock">{formatClock(state.secondsLeft)}</span>
        <ReadyControl state={state} dispatch={dispatch} />
      </section>
      <section className="dp-g__offers">
        <span className="eyebrow">Offers to you</span>
        {incoming.length === 0 ? <p className="dp-empty">Nobody has offered you a trade</p> : null}
        {incoming.map((offer) => {
          const seat = state.seats[offer.from];
          const f = seatFaction(seat);
          return (
            <div key={offer.from} className="dp-g__offer">
              <FactionToken faction={f} size={2.4} />
              <span>
                <strong>{seat.player?.name}</strong> offers you <strong>{f.name}</strong> for {faction.name}
              </span>
              <button type="button" className="dp-swap-action is-accept" disabled={me.player?.ready} onClick={() => dispatch({ type: 'accept', from: offer.from })}>
                Accept
              </button>
            </div>
          );
        })}
        <span className="eyebrow">Your offer</span>
        {outgoing ? (
          <div className="dp-g__offer">
            <FactionToken faction={seatFaction(state.seats[outgoing.to])} size={2.4} />
            <span>
              You offered {faction.name} to <strong>{state.seats[outgoing.to].player?.name}</strong> for {seatFaction(state.seats[outgoing.to]).name}
            </span>
            <button type="button" className="dp-swap-action is-cancel" onClick={() => dispatch({ type: 'cancelOffer' })}>
              Cancel
            </button>
          </div>
        ) : (
          <p className="dp-empty">No open offer of yours</p>
        )}
      </section>
      <section className="dp-g__propose">
        <span className="eyebrow">Propose a trade</span>
        <ul>
          {state.seats
            .filter((seat) => seat.index !== me.index)
            .map((seat) => {
              const f = seatFaction(seat);
              return (
                <li key={seat.index}>
                  <FactionToken faction={f} size={2} dim={!seat.player} />
                  <span>
                    {seat.player ? (
                      <>
                        <strong>{seat.player.name}</strong> plays {f.name}
                        {seat.player.ready ? <i> (ready)</i> : null}
                      </>
                    ) : (
                      <>
                        <em>Open seat</em>, {f.name}
                      </>
                    )}
                  </span>
                  <SeatAction state={state} dispatch={dispatch} seat={seat} />
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}

export const SWAP_PANELS = {
  E: { name: 'Swapping E: your seat card above a roster of player and faction pairs', Panel: PanelE },
  F: { name: 'Swapping F: faction strip in seat order, names under the tokens', Panel: PanelF },
  G: { name: 'Swapping G: trade board with offers and proposals', Panel: PanelG },
} as const;

export type SwapVariant = keyof typeof SWAP_PANELS;
export type { SwapAction, SwapState };
