/* PROTOTYPE (#1147, accepted shape): the play panel as two NestedTabs side by side with a resizer between them. Every tab icon comes from the subject-to-icon map. Left, one level: hand, leaders and Extras, shared inventory, battle planner, spice, log. Right, two levels: one tab per player, and under each the conversation and their public state. Throwaway; never merged. */
import { TopicIcon } from '@ui/content/TopicIcon';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { factionById } from './fixture';
import { leadersOf } from './leaders.fixture';
import { counterpartName, otherSeats, planSummary, threadFor, unreadFor } from './play';
import type { PlayAction, PlayState } from './play';
import { factionName, mySeat } from './setup';
import { FactionInventory, Hand, SharedInventory } from './setupParts';
import { FactionToken } from './parts';

export type PlayProps = { state: PlayState; dispatch: (action: PlayAction) => void };

function factionIdOf(slug: string): string {
  switch (slug) {
    case 'fremen':
      return 'k176nq542xz747341fc42341e18a0t45';
    case 'house-atreides':
      return 'k17ag3gr1h60n7mmh88kj56avs8a1j7x';
    case 'house-harkonnen':
      return 'k174k8mvjqapvgccxtbp9qwh5h8a01b4';
    case 'emperor':
      return 'k17dhptwywynwmpvx18965b97h8a0abp';
    case 'spacing-guild':
      return 'k175bxsjh069ksf64a189360f58a0eck';
    case 'bene-gesserit':
      return 'k17fybprvb614pr3r0bpy410q58a086q';
    default:
      return '';
  }
}

function LeaderChoice({ state, dispatch }: PlayProps) {
  const me = mySeat(state);
  if (!me) {
    return null;
  }
  return (
    <ul className="dpl-choice" aria-label="Leader for this battle">
      {leadersOf(me.faction)
        .filter((leader) => !state.placed.some((piece) => piece.memberId === leader.memberId))
        .map((leader) => (
          <li key={leader.memberId}>
            <button
              type="button"
              className={`dpl-choice__leader ${state.battle.leader === leader.memberId ? 'is-picked' : ''}`}
              aria-pressed={state.battle.leader === leader.memberId}
              disabled={state.battle.committed}
              title={`${leader.name}, strength ${leader.strength}`}
              onClick={() => dispatch({ type: 'chooseLeader', memberId: leader.memberId })}
            >
              <img src={`https://dune.zone/published/leaders/${factionIdOf(me.faction)}.${leader.memberId}/leader.jpg`} alt="" />
              <span>
                {leader.name} <small>{leader.strength}</small>
              </span>
            </button>
          </li>
        ))}
    </ul>
  );
}

/* The battle planner: leader, forces and card, private until the countdown reveal; the committed plan reads back here. */
function BattlePlanner({ state, dispatch }: PlayProps) {
  const b = state.battle;
  return (
    <div className="dpl-battle">
      <p className="dp-hint">Private until the countdown reveal. Choose a leader, commit forces from your reserve, and a card from your hand if you play one.</p>
      <LeaderChoice state={state} dispatch={dispatch} />
      <div className="dpl-battle__row">
        <span className="ds-spawn__label">Forces</span>
        <button type="button" className="dp-swap-action" disabled={b.committed} onClick={() => dispatch({ type: 'setForces', forces: b.forces - 1 })}>
          −
        </button>
        <strong className="dpl-battle__count">{b.forces}</strong>
        <button type="button" className="dp-swap-action" disabled={b.committed} onClick={() => dispatch({ type: 'setForces', forces: b.forces + 1 })}>
          +
        </button>
        <small className="dp-hint">of {state.reserve} in reserve</small>
      </div>
      <div className="dpl-battle__row">
        <span className="ds-spawn__label">Card</span>
        <button type="button" className={`dp-swap-action ${b.card === null ? 'is-accept' : ''}`} disabled={b.committed} onClick={() => dispatch({ type: 'chooseCard', memberId: null })}>
          none
        </button>
        {state.hand.map((held) => (
          <button key={held.leader.memberId} type="button" className={`dp-swap-action ${b.card === held.leader.memberId ? 'is-accept' : ''}`} disabled={b.committed} onClick={() => dispatch({ type: 'chooseCard', memberId: held.leader.memberId })}>
            {held.leader.name}
          </button>
        ))}
      </div>
      <div className="dpl-battle__row">
        {b.committed ? (
          <>
            <span className="dp-note">Committed: {planSummary(state)}. Revealed on the wheel with the countdown once both plans are in.</span>
            <button type="button" className="dp-swap-action is-cancel" onClick={() => dispatch({ type: 'withdrawBattle' })}>
              Withdraw
            </button>
          </>
        ) : (
          <button type="button" className="button button--primary" disabled={b.leader === null} onClick={() => dispatch({ type: 'commitBattle' })}>
            Commit plan
          </button>
        )}
      </div>
    </div>
  );
}

/* The public log, newest first, with the way to its full page. */
function Log({ state }: { state: PlayState }) {
  return (
    <div className="dpl-log">
      <ol className="dpl-log__list" aria-label="Game log">
        {state.log.map((entry, index) => (
          <li key={index}>
            <small>{entry.at}</small>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
      <a className="dp-swap-action" href="#log">
        Full log
      </a>
    </div>
  );
}

function Thread({ state, dispatch, faction }: PlayProps & { faction: string }) {
  const messages = threadFor(state, faction);
  return (
    <div className="dpl-thread">
      <ol className="dpl-thread__list" aria-label={`Conversation with ${counterpartName(state, faction)}`}>
        {messages.map((message, index) => (
          <li key={index} className={message.from === 'me' ? 'is-me' : ''}>
            <span>{message.text}</span>
            <small>{message.at}</small>
          </li>
        ))}
        {messages.length === 0 ? <li className="dp-empty">No messages yet.</li> : null}
      </ol>
      <form
        className="dpl-thread__compose"
        onSubmit={(event) => {
          event.preventDefault();
          dispatch({ type: 'sendMessage' });
        }}
      >
        <input type="text" value={state.draft} placeholder={`Message ${factionName(faction)}`} aria-label="Message" onChange={(event) => dispatch({ type: 'draftMessage', text: event.target.value })} />
        <button type="submit" className="button button--primary" disabled={!state.draft.trim()}>
          Send
        </button>
        <a className="dp-swap-action" href={`#messages-${faction}`}>
          Full page
        </a>
      </form>
    </div>
  );
}

/* Spice management: the private bank, a stack spawned from it onto the table, and the stacks on the table that can be picked up. */
function SpicePane({ state, dispatch }: PlayProps) {
  const me = mySeat(state);
  return (
    <div className="dpl-spice">
      <dl className="ds-figures">
        <div>
          <dt>Your bank</dt>
          <dd>{state.bank} spice, private</dd>
        </div>
      </dl>
      <div className="dpl-battle__row">
        <span className="ds-spawn__label">Spawn a stack</span>
        <button type="button" className="dp-swap-action" onClick={() => dispatch({ type: 'setSpawnAmount', amount: state.spawnAmount - 1 })}>
          −
        </button>
        <strong className="dpl-battle__count">{state.spawnAmount}</strong>
        <button type="button" className="dp-swap-action" onClick={() => dispatch({ type: 'setSpawnAmount', amount: state.spawnAmount + 1 })}>
          +
        </button>
        <button type="button" className="button button--primary" disabled={state.spawnAmount > state.bank} onClick={() => dispatch({ type: 'spawnSpice' })}>
          Spawn on the table
        </button>
      </div>
      <p className="dp-hint">The stack lands in front of you. Move it to whoever it is for; they pick it up into their bank. Every stack on the table is public.</p>
      <ul className="ds-items" aria-label="Spice stacks on the table">
        {state.stacks.map((stack) => (
          <li key={stack.id}>
            <span className="ds-items__kind">stack</span>
            <span className="ds-items__name">
              {stack.amount} spice <small>{stack.from === me?.faction ? 'spawned by you' : `from ${factionName(stack.from)}, in front of you`}</small>
            </span>
            <button type="button" className="dp-swap-action is-accept" onClick={() => dispatch({ type: 'pickUpSpice', stack: stack.id })}>
              Pick up
            </button>
          </li>
        ))}
        {state.stacks.length === 0 ? <li className="dp-empty">No spice stacks on the table.</li> : null}
      </ul>
    </div>
  );
}

function PublicPane({ state, faction }: { state: PlayState; faction: string }) {
  const seat = state.seats.find((candidate) => candidate.faction === faction);
  const stacksFromThem = state.stacks.filter((stack) => stack.from === faction).reduce((sum, stack) => sum + stack.amount, 0);
  return (
    <dl className="ds-figures dpl-public">
      <div>
        <dt>Seat</dt>
        <dd>
          {seat ? seat.index + 1 : '?'}, {seat?.player?.name ?? 'vacant'}
        </dd>
      </div>
      <div>
        <dt>Their spice on the table</dt>
        <dd>{stacksFromThem} spice in stacks</dd>
      </div>
      <div>
        <dt>Prediction</dt>
        <dd>{faction === 'bene-gesserit' ? (state.prediction.revealed ? `revealed: ${factionName(state.prediction.faction ?? '')}, turn ${state.prediction.turn}` : state.prediction.status) : 'none'}</dd>
      </div>
      <div>
        <dt>Connection</dt>
        <dd>{seat?.connected ? 'online' : 'offline'}</dd>
      </div>
    </dl>
  );
}

function useSplit() {
  const [split, setSplit] = useState(50);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const host = event.currentTarget.parentElement;
    if (!host) {
      return;
    }
    const bounds = host.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => setSplit(Math.max(28, Math.min(72, ((moveEvent.clientX - bounds.left) / bounds.width) * 100)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { split, onPointerDown };
}

export function PlayPanel({ state, dispatch }: PlayProps) {
  const { split, onPointerDown } = useSplit();
  const left = state.left[0] ?? 'hand';
  const right = state.right;
  const others = otherSeats(state);
  const rightFaction = right[0] ?? others[0]?.faction ?? '';
  const leftItem = (key: string, label: string, icon: ReactNode) => (
    <NestedTabs.Item as="button" type="button" path={[key]} label={label} icon={icon} onClick={() => dispatch({ type: 'setLeft', path: [key] })} />
  );
  const rightItem = (key: string, label: string, icon: ReactNode) => (
    <NestedTabs.Item as="button" type="button" path={[rightFaction, key]} label={label} icon={icon} onClick={() => dispatch({ type: 'setRight', path: [rightFaction, key] })} />
  );
  return (
    <div className="dp-panel dpl" style={{ '--play-split': `${split}%` } as CSSProperties}>
      <NestedTabs activePath={[left]} ariaLabel="Yours" className="dpl-tabs">
        <NestedTabs.Level label="Yours">
          {leftItem('hand', 'Hand', <TopicIcon topic="hand" size={22} />)}
          {leftItem('leaders', 'Leaders and Extras', <TopicIcon topic="leaders" size={22} />)}
          {leftItem('shared', 'Shared inventory', <TopicIcon topic="assets" size={22} />)}
          {leftItem('battle', 'Battle planner', <TopicIcon topic="battle" size={22} />)}
          {leftItem('spice', 'Spice', <TopicIcon topic="spice" size={22} />)}
          {leftItem('log', 'Log', <TopicIcon topic="log" size={22} />)}
        </NestedTabs.Level>
        <NestedTabs.ContentPanel aria-label="Yours">
          <div className="dpl-content">
            {left === 'hand' ? <Hand state={state} dispatch={dispatch} size={0.2} /> : null}
            {left === 'leaders' ? <FactionInventory state={state} dispatch={dispatch} size={4.6} /> : null}
            {left === 'shared' ? <SharedInventory state={state} dispatch={dispatch} /> : null}
            {left === 'battle' ? <BattlePlanner state={state} dispatch={dispatch} /> : null}
            {left === 'spice' ? <SpicePane state={state} dispatch={dispatch} /> : null}
            {left === 'log' ? <Log state={state} /> : null}
          </div>
        </NestedTabs.ContentPanel>
      </NestedTabs>
      <div className="dpl-resizer" role="separator" aria-orientation="vertical" aria-label="Resize the two panes" onPointerDown={onPointerDown} />
      <NestedTabs activePath={right} ariaLabel="Players" className="dpl-tabs">
        <NestedTabs.Level label="Players">
          {others.map((seat) => (
            <NestedTabs.Item
              key={seat.faction}
              as="button"
              type="button"
              path={[seat.faction]}
              label={`${counterpartName(state, seat.faction)}${unreadFor(state, seat.faction) ? ', unread' : ''}`}
              icon={
                <span className={`dpl-player ${unreadFor(state, seat.faction) ? 'has-unread' : ''}`}>
                  <FactionToken faction={factionById(seat.faction)} size={1.4} />
                </span>
              }
              onClick={() => dispatch({ type: 'setRight', path: [seat.faction, 'thread'] })}
            />
          ))}
        </NestedTabs.Level>
        <NestedTabs.Level label={rightFaction ? counterpartName(state, rightFaction) : 'Player'}>
          {rightItem('thread', 'Conversation', <TopicIcon topic="messages" size={22} />)}
          {rightItem('public', 'Public state', <TopicIcon topic="publicState" size={22} />)}
        </NestedTabs.Level>
        <NestedTabs.ContentPanel aria-label="Players">
          <div className="dpl-content">
            {rightFaction ? (
              <>
                <h3 className="ds-title">{counterpartName(state, rightFaction)}</h3>
                {right[1] === 'thread' ? <Thread state={state} dispatch={dispatch} faction={rightFaction} /> : null}
                {right[1] === 'public' ? <PublicPane state={state} faction={rightFaction} /> : null}
              </>
            ) : null}
          </div>
        </NestedTabs.ContentPanel>
      </NestedTabs>
    </div>
  );
}
