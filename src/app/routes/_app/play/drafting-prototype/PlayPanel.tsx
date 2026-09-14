import { Badge } from '@mantine/core';
/* PROTOTYPE (#1147, accepted shape): the play panel as two NestedTabs side by side with a resizer between them. Every tab icon comes from the subject-to-icon map. Left: hand, leaders and Extras, shared inventory, battle planner, spice and Log. Log opens Game and Audit in a second level. Right, two levels: one tab per player, and under each the conversation and their public state. Throwaway; never merged. */
import { TopicIcon } from '@ui/content/TopicIcon';
import { LOG_CLASSIFICATIONS } from './logClassification';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { factionById } from './fixture';
import { counterpartName, otherSeats, threadFor, unreadFor } from './play';
import type { PlayAction, PlayState, LogEntry, LogScenario } from './play';
import { factionName, mySeat } from './setup';
import { FactionInventory, Hand, SharedInventory } from './setupParts';
import { FactionToken, NoticeMark } from './parts';

export type PlayProps = { state: PlayState; dispatch: (action: PlayAction) => void };

/* Public fixtures for the compact log and its Game/Audit grouping. */
const LOG_EXAMPLES: LogEntry[] = [
  { kind: 'phase', at: 'Turn 3 · Spice collection', text: 'Spice collection began.' },
  { kind: 'battle', at: 'Turn 3 · Battle', text: 'Fremen defeated House Atreides.' },
  { kind: 'spice', at: 'Turn 3 · Battle', text: 'Fremen moved 4 spice from its bank to the table.' },
  { kind: 'seat', at: 'Turn 3 · Shipment and movement', text: 'Twaffle took seat 2, approved by Thialfi.' },
  { kind: 'prediction', at: 'Turn 3 · Shipment and movement', text: 'Bene Gesserit revealed its prediction: Fremen, turn 3.' },
  { kind: 'vote', at: 'Turn 2 · Mentat pause', text: 'Seat 4 retained: 2 remove, 3 retain, 1 abstain.' },
  { kind: 'battle', at: 'Turn 2 · Battle', text: 'Fremen and House Atreides agreed on no winner.' },
  { kind: 'seat', at: 'Turn 2 · Bidding', text: '[deleted user] left seat 2.' },
  { kind: 'phase', at: 'Turn 1 · Storm', text: 'Turn 1 began.' },
];

/* The public log stays in its accepted tab, with participation records in Audit. */
function Log({ state, scenario }: { state: PlayState; scenario?: LogScenario }) {
  const records = scenario === 'log-empty' ? [] : scenario === 'log-older' ? LOG_EXAMPLES.slice(6) : scenario ? LOG_EXAMPLES : state.log;
  const group = state.left[1] === 'audit' ? 'audit' : 'game';
  const entries = records.filter((entry) => (entry.kind === 'seat' || entry.kind === 'vote' ? 'audit' : 'game') === group);
  return (
    <div className="dpl-log" data-log-variant="log" data-log-group={group}>
      <ol className="dpl-log__list" aria-label="Game log">
        {entries.map((entry, index) => (
          <li key={index}>
            <Badge variant="light" color={LOG_CLASSIFICATIONS[entry.kind].color} size="sm" tt="none">{LOG_CLASSIFICATIONS[entry.kind].label}</Badge>
            <div>
              <span>{entry.text}</span>
              <small>{entry.at}</small>
            </div>
          </li>
        ))}
      </ol>
      {entries.length === 0 ? <span className="dp-empty">No entries yet.</span> : null}
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

export function PlayPanel({ state, dispatch, battleContent, logScenario }: PlayProps & { battleContent: ReactNode; logScenario?: LogScenario }) {
  const { split, onPointerDown } = useSplit();
  const left = state.left[0] ?? 'hand';
  const logGroup = state.left[1] === 'audit' ? 'audit' : 'game';
  const leftPath = left === 'log' ? ['log', logGroup] : [left];
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
      <NestedTabs activePath={leftPath} ariaLabel="Yours" className="dpl-tabs">
        <NestedTabs.Level label="Yours">
          {leftItem('hand', 'Hand', <TopicIcon topic="hand" size={22} />)}
          {leftItem('leaders', 'Leaders and Extras', <TopicIcon topic="leaders" size={22} />)}
          {leftItem('shared', 'Shared inventory', <TopicIcon topic="assets" size={22} />)}
          {leftItem('battle', 'Battle planner', <TopicIcon topic="battle" size={22} />)}
          {leftItem('spice', 'Spice', <TopicIcon topic="spice" size={22} />)}
          {leftItem('log', 'Log', <TopicIcon topic="log" size={22} />)}
        </NestedTabs.Level>
        {left === 'log' ? (
          <NestedTabs.Level label="Log">
            <NestedTabs.Item as="button" type="button" path={['log', 'game']} label="Game" icon={<TopicIcon topic="game" size={22} />} onClick={() => dispatch({ type: 'setLeft', path: ['log', 'game'] })} />
            <NestedTabs.Item as="button" type="button" path={['log', 'audit']} label="Audit" icon={<TopicIcon topic="audit" size={22} />} onClick={() => dispatch({ type: 'setLeft', path: ['log', 'audit'] })} />
          </NestedTabs.Level>
        ) : null}
        <NestedTabs.ContentPanel aria-label="Yours">
          <div className={`dpl-content${left === 'log' ? ' dpl-content--log' : ''}`}>
            {left === 'hand' ? <Hand state={state} dispatch={dispatch} size={0.2} /> : null}
            {left === 'leaders' ? <FactionInventory state={state} dispatch={dispatch} size={4.6} /> : null}
            {left === 'shared' ? <SharedInventory state={state} dispatch={dispatch} /> : null}
            {left === 'battle' ? battleContent : null}
            {left === 'spice' ? <SpicePane state={state} dispatch={dispatch} /> : null}
            {left === 'log' ? <Log state={state} scenario={logScenario} /> : null}
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
                <NoticeMark active={unreadFor(state, seat.faction) > 0} title="Unread messages">
                  <FactionToken faction={factionById(seat.faction)} size={1.4} />
                </NoticeMark>
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
