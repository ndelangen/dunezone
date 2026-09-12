/* PROTOTYPE (#1146): shared throwaway parts for the three setup panel variants: the flat phase mark, the phase controls, the seat roster, the hand, the inventories, the prediction lock, the conversations and the vacancy bar. Real renderers for leaders and traitor cards. Throwaway; never merged. */
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';
import { useId } from 'react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';

import { PHASE_DISC_COLOR, PHASE_INK_COLOR, PHASE_RING_INNER_RADIUS, PHASE_RING_OUTER_RADIUS, PHASE_SYMBOL_MAX_RADIUS } from '../phaseSymbolLayout';
import { factionById } from './fixture';
import { leadersOf } from './leaders.fixture';
import { DecisionBar, RequestMark } from './panelParts';
import { AdvanceButtons, Avatar, FactionToken, OpenSeat, useNow } from './parts';
import { activePhase, factionName, isPredictor, myFaction, mySeat, nextBlockedReason, PHASE_CHANGE_COOLDOWN_MS, phaseCooldownLeft, phaseIndex, readiness, SETUP_PHASES, SPAWN_OPTIONS, TURN_PHASES } from './setup';
import type { DragItem, SetupAction, SetupState } from './setup';

export type SetupProps = { state: SetupState; dispatch: (action: SetupAction) => void };

/* The phase's silhouette flat on its disc, the header's own markup, sized by the caller. */
export function PhaseMark({ symbol, size = 2.75 }: Readonly<{ symbol?: string; size?: number }>) {
  const clipId = useId();
  const style = { width: `${size}rem`, height: `${size}rem` } as CSSProperties;
  return (
    <svg className="ds-mark" viewBox="0 0 100 100" aria-hidden="true" style={style}>
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r={50 * PHASE_SYMBOL_MAX_RADIUS} />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill={PHASE_DISC_COLOR} />
      <circle
        cx="50"
        cy="50"
        r={25 * (PHASE_RING_OUTER_RADIUS + PHASE_RING_INNER_RADIUS)}
        fill="none"
        stroke={PHASE_INK_COLOR}
        strokeWidth={50 * (PHASE_RING_OUTER_RADIUS - PHASE_RING_INNER_RADIUS)}
      />
      {symbol ? (
        <g clipPath={`url(#${clipId})`}>
          <use
            href={`${symbol}#root`}
            x={50 * (1 - PHASE_SYMBOL_MAX_RADIUS)}
            y={50 * (1 - PHASE_SYMBOL_MAX_RADIUS)}
            width={100 * PHASE_SYMBOL_MAX_RADIUS}
            height={100 * PHASE_SYMBOL_MAX_RADIUS}
            fill={PHASE_INK_COLOR}
          />
        </g>
      ) : null}
    </svg>
  );
}

/* Setup step n of m as page-header content, with the flat mark. */
export function SetupHeader({ state }: Readonly<{ state: SetupState }>) {
  const phase = activePhase(state);
  const r = readiness(state);
  return (
    <div className="ds-header" aria-live="polite">
      <PhaseMark symbol={phase.symbol} />
      <div className="ds-header__copy">
        <span>
          Setup, step {phaseIndex(state) + 1} of {SETUP_PHASES.length}
        </span>
        <strong>{phase.label}</strong>
      </div>
      {phase.kind === 'instructions' ? null : (
        <span className="dp-gate">
          Ready <strong>{r.ready}</strong>/{r.seated}
        </span>
      )}
    </div>
  );
}

/* Ready for the active phase, the ready count, and why Next waits. Ready is reversible and locks nothing; Next itself lives in the header. */
export function PhaseControls({ state, dispatch, stacked = false }: SetupProps & { stacked?: boolean }) {
  const phase = activePhase(state);
  const me = mySeat(state);
  const reason = nextBlockedReason(state);
  const r = readiness(state);
  return (
    <div className={`ds-controls ${stacked ? 'ds-controls--stacked' : ''}`}>
      {phase.kind !== 'instructions' && me ? (
        <button type="button" className={`button ${me.ready ? 'button--quiet' : 'button--primary'} ds-ready`} aria-pressed={me.ready} onClick={() => dispatch({ type: 'toggleReady' })}>
          {me.ready ? `${phase.readyLabel ?? 'Ready'} ✓ (withdraw)` : (phase.readyLabel ?? 'Ready')}
        </button>
      ) : null}
      {phase.kind !== 'instructions' ? (
        <span className="ds-controls__count">
          Ready {r.ready} of {r.seated}
        </span>
      ) : null}
      {reason ? (
        <p className="ds-controls__reason" role="status">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

/* Previous and Next for the setup sequence, the rightmost thing in the header's toolbar; both wait out the cooldown after any change. */
export function SetupAdvance({ state, dispatch }: SetupProps) {
  const phase = activePhase(state);
  const me = mySeat(state);
  const now = useNow(250);
  const left = phaseCooldownLeft(state, now);
  const cooling = left > 0;
  const reason = nextBlockedReason(state);
  const last = phaseIndex(state) === SETUP_PHASES.length - 1;
  const seconds = Math.ceil(left / 1000);
  return (
    <AdvanceButtons
      onPrevious={() => dispatch({ type: 'previous', at: Date.now() })}
      onNext={() => dispatch({ type: 'next', at: Date.now() })}
      previousDisabled={!me || phaseIndex(state) === 0 || cooling}
      nextDisabled={!me || reason !== null || cooling}
      nextLabel={phase.nextLabel ?? (last ? 'Begin Turn 1' : 'Next phase')}
      reason={cooling ? `One phase change per ${PHASE_CHANGE_COOLDOWN_MS / 1000} seconds; ${seconds} s left.` : (reason ?? undefined)}
      countdown={cooling ? seconds : undefined}
    />
  );
}

/* The phase's mark, name and instructions as one block; the caller decides what sits beside it. */
export function PhaseCopy({ state, size = 3.4 }: Readonly<{ state: SetupState; size?: number }>) {
  const phase = activePhase(state);
  return (
    <div className="ds-phase">
      <PhaseMark symbol={phase.symbol} size={size} />
      <div className="ds-phase__copy">
        <span className="eyebrow">
          {phase.declaredBy ? `${factionName(phase.declaredBy)} phase` : 'Setup'} · {phase.kind === 'instructions' ? 'instructions only' : phase.kind === 'builtin' ? 'required action' : 'everyone readies'}
        </span>
        <strong>{phase.label}</strong>
        <p>{phase.instructions}</p>
      </div>
    </div>
  );
}

/* The setup steps and the first turn phase as a stepper; the active step is marked. */
export function Stepper({ state, dispatch }: SetupProps) {
  const index = phaseIndex(state);
  const firstTurn = TURN_PHASES[0];
  return (
    <ol className="ds-stepper" aria-label="Setup steps">
      {SETUP_PHASES.map((phase, position) => (
        <li key={phase.id} className={position === index ? 'is-active' : position < index ? 'is-done' : ''} aria-current={position === index ? 'step' : undefined}>
          <PhaseMark symbol={phase.symbol} size={2} />
          <span>{phase.label}</span>
          {position < index ? (
            <button type="button" className="dp-swap-action" onClick={() => dispatch({ type: 'previous', at: Date.now() })} disabled={position !== index - 1}>
              Back
            </button>
          ) : null}
        </li>
      ))}
      <li className="is-turn">
        <PhaseMark symbol={firstTurn.symbol} size={2} />
        <span>Turn 1: {firstTurn.label}</span>
      </li>
    </ol>
  );
}

/* Every seat: faction token, player, ready mark, offline or vacant. */
export function SeatRoster({ state, compact = false }: Readonly<{ state: SetupState; compact?: boolean }>) {
  const phase = activePhase(state);
  return (
    <ol className={`ds-roster ${compact ? 'ds-roster--compact' : ''}`} aria-label="Seats">
      {state.seats.map((seat) => {
        const faction = factionById(seat.faction);
        const mine = seat.player?.id === state.meId;
        return (
          <li key={seat.index} className={`${mine ? 'is-me' : ''} ${seat.player ? '' : 'is-open'}`}>
            <FactionToken faction={faction} size={compact ? 1.7 : 2.1} />
            {seat.player ? <Avatar player={{ ...seat.player, ready: false, picks: [], bans: [], slug: seat.player.id }} size={compact ? 1.7 : 2.1} /> : <OpenSeat size={compact ? 1.7 : 2.1} />}
            <span className="ds-roster__name">
              {seat.player ? seat.player.name : 'Vacant'}
              {mine ? ' (you)' : ''}
              {compact ? null : <small>{faction.name}</small>}
            </span>
            <span className={`ds-roster__state ${seat.ready ? 'is-ready' : ''}`}>
              {!seat.player ? 'waits for a replacement' : phase.kind === 'instructions' ? '' : seat.ready ? 'Ready' : 'Not ready'}
              {seat.player && !seat.connected ? <em> offline, still counts</em> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* Drag handlers for a piece in the hand or an inventory; the drop lands on the table's drop zone. */
function dragHandlers(dispatch: SetupProps['dispatch'], item: DragItem) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData('text/plain', JSON.stringify(item));
      event.dataTransfer.effectAllowed = 'move';
      dispatch({ type: 'dragStart', item });
    },
    onDragEnd: () => dispatch({ type: 'dragEnd' }),
  };
}

/* The table as a drop target while a piece is being dragged; mounted in the overlay layer only for that moment. */
export function DropZone({ state, dispatch }: SetupProps) {
  if (!state.dragging) {
    return null;
  }
  return (
    <div
      className="ds-dropzone"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        dispatch({ type: 'drop' });
      }}
    >
      <span>Drop on the table</span>
    </div>
  );
}

/* The current player's traitor hand as the real cards, or a line saying it is empty. */
export function Hand({ state, dispatch, size = 0.42 }: SetupProps & { size?: number }) {
  if (state.hand.length === 0) {
    return <p className="dp-hint">Your hand is empty.</p>;
  }
  return (
    <ul className="ds-hand" aria-label="Your traitor hand">
      {state.hand.map((held) => {
        const faction = factionById(held.faction);
        return (
          <li
            key={held.leader.memberId}
            className="ds-card"
            style={{ '--card-scale': size } as CSSProperties}
            title={`${held.leader.name}, ${faction.name}, strength ${held.leader.strength}. Drag to the table to put it back face down.`}
            {...dragHandlers(dispatch, { kind: 'traitor', memberId: held.leader.memberId })}
          >
            <div className="ds-card__inner">
              <TraitorCard
                name={held.leader.name}
                strength={held.leader.strength}
                image={held.leader.image}
                memberId={held.leader.memberId}
                logo={faction.logo}
                background={faction.background}
                owner={faction.name}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* The prediction reveal card: created in the predictor's inventory on lock; dragging it onto the table is the reveal, after which it lives on the table. */
export function PredictionCard({ state, dispatch, size = 5.2 }: SetupProps & { size?: number }) {
  const p = state.prediction;
  if (!isPredictor(state) || p.status !== 'locked' || !p.faction || !p.turn || state.placed.some((piece) => piece.id === 'prediction')) {
    return null;
  }
  return (
    <div className="ds-predcard" style={{ '--leader-size': `${size}rem` } as CSSProperties} title="Prediction reveal card. Drag it onto the table, then flip it to reveal." {...dragHandlers(dispatch, { kind: 'prediction' })}>
      <span className="ds-predcard__eyebrow">Prediction</span>
      <FactionToken faction={factionById(p.faction)} size={size * 0.5} />
      <strong>{factionName(p.faction)}</strong>
      <small>wins on turn {p.turn}</small>
    </div>
  );
}

/* The faction inventory: the real leader tokens, the prediction reveal card once locked, the reserve and the bank, all private to the current player. */
export function FactionInventory({ state, dispatch, size = 5.2 }: SetupProps & { size?: number }) {
  const slug = myFaction(state);
  if (!slug) {
    return <p className="dp-hint">You hold no faction inventory.</p>;
  }
  const faction = factionById(slug);
  return (
    <div className="ds-inventory">
      <ul className="ds-leaders" aria-label="Your leaders">
        {leadersOf(slug)
          .filter((leader) => !state.placed.some((piece) => piece.memberId === leader.memberId))
          .map((leader) => (
          <li
            key={leader.memberId}
            className="ds-leader"
            style={{ '--leader-size': `${size}rem` } as CSSProperties}
            title={`${leader.name}, strength ${leader.strength}. Drag to the table.`}
            {...dragHandlers(dispatch, { kind: 'leader', memberId: leader.memberId })}
          >
            <LeaderToken name={leader.name} strength={leader.strength} image={leader.image} memberId={leader.memberId} logo={faction.logo} background={faction.background} />
          </li>
        ))}
        <li>
          <PredictionCard state={state} dispatch={dispatch} size={size} />
        </li>
      </ul>
      <dl className="ds-figures">
        <div>
          <dt>Reserve</dt>
          <dd>{state.reserve} forces behind your token</dd>
        </div>
        <div>
          <dt>Bank</dt>
          <dd>{state.spice} spice, banked once</dd>
        </div>
      </dl>
    </div>
  );
}

/* A refused spawn request: the asset and what is missing, returned to the requester and never listed as pending. */
export function RefusalNote({ state, dispatch }: SetupProps) {
  if (!state.refusal) {
    return null;
  }
  return (
    <p className="dp-note dp-note--blocking" role="alert">
      <strong>Refused. </strong>
      {state.refusal.reason}{' '}
      <button type="button" className="dp-swap-action" onClick={() => dispatch({ type: 'dismissRefusal' })}>
        Dismiss
      </button>
    </p>
  );
}

/* The shared inventory: spawned material, the spawn control, pending requests with approve and dismiss, and the refusal unless the caller shows it elsewhere. */
export function SharedInventory({ state, dispatch, withRefusal = true }: SetupProps & { withRefusal?: boolean }) {
  const me = mySeat(state);
  return (
    <div className="ds-shared">
      <ul className="ds-items" aria-label="Shared inventory">
        {state.shared.map((item) => (
          <li key={item.id} title={me ? `${item.name}. Drag to the table.` : item.name} {...(me ? dragHandlers(dispatch, { kind: 'shared', id: item.id }) : {})}>
            <span className="ds-items__kind">{item.kind}</span>
            <span className="ds-items__name">
              {item.name} <small>{item.count}</small>
            </span>
            <small className="ds-items__origin">{item.origin}</small>
          </li>
        ))}
      </ul>
      {me ? (
        <div className="ds-spawn">
          <span className="ds-spawn__label">Spawn</span>
          {SPAWN_OPTIONS.map((option) => (
            <button key={option.id} type="button" className="dp-swap-action" title={option.ready ? `Request ${option.name}` : `${option.name} is not ready`} onClick={() => dispatch({ type: 'requestSpawn', option: option.id })}>
              {option.name} <small>{option.count}</small>
            </button>
          ))}
        </div>
      ) : null}
      {withRefusal ? <RefusalNote state={state} dispatch={dispatch} /> : null}
      {state.requests.length ? (
        <ul className="ds-requests" aria-label="Pending spawn requests">
          {state.requests.map((request) => {
            const requester = state.seats.find((seat) => seat.player?.id === request.requestedBy)?.player;
            const mine = request.requestedBy === me?.player?.id;
            return (
              <li key={request.id}>
                {requester ? <Avatar player={{ ...requester, ready: false, picks: [], bans: [], slug: requester.id }} size={1.6} /> : null}
                <span className="ds-items__name">
                  {request.name} <small>{request.count}</small>
                </span>
                <small className="ds-items__origin">
                  {requester?.name ?? 'someone'} asks; {mine ? 'one other player approves' : 'your approval spawns it'}
                </small>
                {me && !mine ? (
                  <button type="button" className="dp-swap-action is-accept" onClick={() => dispatch({ type: 'approveSpawn', request: request.id })}>
                    Approve
                  </button>
                ) : null}
                {me ? (
                  <button type="button" className="dp-swap-action is-cancel" onClick={() => dispatch({ type: 'dismissSpawn', request: request.id })}>
                    Dismiss
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dp-hint">No pending requests.</p>
      )}
    </div>
  );
}

/* The prediction: selectors and Lock for the predicting faction's player; pending or locked for everyone else. */
export function PredictionLock({ state, dispatch }: SetupProps) {
  const p = state.prediction;
  if (!isPredictor(state)) {
    return (
      <p className="ds-prediction__public">
        Bene Gesserit prediction: <strong>{p.status === 'locked' ? 'locked' : 'pending'}</strong>
        {p.revealed && p.faction && p.turn ? ` and revealed: ${factionName(p.faction)}, turn ${p.turn}` : ''}
      </p>
    );
  }
  if (p.status === 'locked' && p.faction && p.turn) {
    return (
      <div className="ds-prediction">
        <FactionToken faction={factionById(p.faction)} size={2.6} />
        <span className="ds-prediction__copy">
          <strong>Locked: {factionName(p.faction)} wins on turn {p.turn}</strong>
          <small>{p.revealed ? 'Revealed to everyone.' : state.placed.some((piece) => piece.id === 'prediction') ? 'The card lies face down on the table; flip it to reveal.' : 'Only the fact is public. The reveal card is in your inventory.'}</small>
        </span>
      </div>
    );
  }
  return (
    <div className="ds-prediction ds-prediction--pick">
      <fieldset className="ds-pick" aria-label="Predicted faction">
        <legend>Faction</legend>
        {state.seats.map((seat) => (
          <button key={seat.faction} type="button" className={`ds-pick__faction ${seat.faction === p.faction ? 'is-picked' : ''}`} aria-pressed={seat.faction === p.faction} onClick={() => dispatch({ type: 'predict', faction: seat.faction })}>
            <FactionToken faction={factionById(seat.faction)} size={2.2} />
          </button>
        ))}
      </fieldset>
      <fieldset className="ds-pick" aria-label="Predicted turn">
        <legend>Turn</legend>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((turn) => (
          <button key={turn} type="button" className={`ds-pick__turn ${turn === p.turn ? 'is-picked' : ''}`} aria-pressed={turn === p.turn} onClick={() => dispatch({ type: 'predict', turn })}>
            {turn}
          </button>
        ))}
      </fieldset>
      <button
        type="button"
        className="button button--primary"
        disabled={p.faction === null || p.turn === null}
        title={p.faction === null || p.turn === null ? 'Choose a faction and a turn first' : undefined}
        onClick={() => dispatch({ type: 'lockPrediction' })}
      >
        Lock prediction
      </button>
    </div>
  );
}

/* The current faction's conversations with a way in; each is a sub-page of the game. */
export function Conversations({ state }: Readonly<{ state: SetupState }>) {
  if (!mySeat(state)) {
    return <p className="dp-hint">Spectators read no conversations.</p>;
  }
  return (
    <ul className="ds-messages" aria-label="Conversations">
      {state.conversations.map((conversation) => (
        <li key={conversation.faction}>
          <FactionToken faction={factionById(conversation.faction)} size={1.9} />
          <span className="ds-messages__copy">
            <strong>
              {factionName(conversation.faction)}
              {conversation.unread ? <span className="ds-unread">{conversation.unread}</span> : null}
            </strong>
            <small>{conversation.last}</small>
          </span>
          <a className="dp-swap-action" href={`#messages-${conversation.faction}`}>
            Open
          </a>
        </li>
      ))}
    </ul>
  );
}

/* The vacancy bar: a request to approve, or the vacancy itself while Turn 1 waits. */
export function VacancyBar({ state, dispatch }: SetupProps) {
  const request = state.seatRequests[0];
  const vacant = state.seats.find((seat) => !seat.player);
  if (!vacant) {
    return null;
  }
  if (request) {
    return (
      <DecisionBar
        tone="accepted"
        media={<RequestMark request={request} />}
        eyebrow="Seat request"
        title={`${request.name} asks for seat ${request.seat + 1}, ${factionName(vacant.faction)}`}
        context="Your approval seats them with the faction's state as it stands; they give their own Ready to play before Turn 1 begins."
        action={
          <button type="button" className="button button--primary" onClick={() => dispatch({ type: 'approveSeat', request: request.id })}>
            Approve
          </button>
        }
      />
    );
  }
  return (
    <DecisionBar
      media={<OpenSeat size={2.4} />}
      eyebrow="Vacant seat"
      title={`Seat ${vacant.index + 1}, ${factionName(vacant.faction)}, is vacant`}
      context="Its faction state is kept. Turn 1 waits for a spectator to request the seat and a player to approve."
      action={<span className="dp-swap-action dp-swap-action--self">waiting</span>}
    />
  );
}

export function SectionTitle({ children, aside }: Readonly<{ children: string; aside?: ReactNode }>) {
  return (
    <h3 className="ds-title">
      {children}
      {aside ? <span className="ds-title__aside">{aside}</span> : null}
    </h3>
  );
}
