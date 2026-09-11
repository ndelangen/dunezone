/* PROTOTYPE (#1145, variant "tabs"): one pane with Factions, Your draft and Seats as ConnectedTabs, the seat bar above, gates, the note and Ready in a footer that never moves. Throwaway; never merged. */
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import type { ConnectedTabsItem } from '@ui/surface/ConnectedTabs';
import { Armchair, Hand, Search } from 'lucide-react';
import { useState } from 'react';

import { factionById, gates, me, searchFactions } from './fixture';
import { DraftNote, FactionRow, RequestMark, SearchTools, SeatBar } from './panelParts';
import { Avatar, FactionToken, GatesReadout, OpenSeat, ReadyButton } from './parts';
import type { VariantProps } from './parts';

type Tab = 'factions' | 'draft' | 'seats';

function FactionsTab({ state, dispatch }: VariantProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const rows = searchFactions(query, showAll);
  return (
    <div className="dp-t__tab">
      <SearchTools query={query} showAll={showAll} onQuery={setQuery} onShowAll={setShowAll} />
      <ul className="dp-list">
        {rows.map((faction) => (
          <FactionRow key={faction.id} state={state} dispatch={dispatch} faction={faction} />
        ))}
        {rows.length === 0 ? <li className="dp-empty">No faction matches</li> : null}
      </ul>
    </div>
  );
}

function DraftTab({ state, dispatch }: VariantProps) {
  const current = me(state);
  if (!current) {
    return null;
  }
  return (
    <div className="dp-t__tab dp-t__draft">
      <section>
        <h3>Drafted by you</h3>
        <ul>
          {current.picks.map((id) => (
            <li key={id}>
              <FactionToken faction={factionById(id)} size={2} highlighted />
              <span className="dp-t__name">{factionById(id).name}</span>
              <button type="button" className="dp-swap-action" onClick={() => dispatch({ type: 'unpick', faction: id })}>
                Remove
              </button>
            </li>
          ))}
          {current.picks.length === 0 ? <li className="dp-empty">Nothing yet. Draft from the Factions tab.</li> : null}
        </ul>
      </section>
      <section>
        <h3>Banned by you</h3>
        <ul>
          {current.bans.map((id) => (
            <li key={id}>
              <FactionToken faction={factionById(id)} size={2} banned />
              <span className="dp-t__name">{factionById(id).name}</span>
              <button type="button" className="dp-swap-action is-cancel" onClick={() => dispatch({ type: 'unban', faction: id })}>
                Lift ban
              </button>
            </li>
          ))}
          {current.bans.length === 0 ? <li className="dp-empty">None. A ban strips every pick of that faction and blocks new ones.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function SeatsTab({ state, dispatch }: VariantProps) {
  const current = me(state);
  const open = Math.max(0, state.seatCount - state.players.length);
  return (
    <div className="dp-t__tab">
      <ol className="dp-t__roster" aria-label="Seats">
        {state.players.map((player, index) => (
          <li key={player.id} className={player.id === current?.id ? 'is-me' : ''}>
            <Avatar player={player} size={2} label={false} />
            <span>
              Seat {index + 1}: {player.name}
              {player.id === current?.id ? ' (you)' : ''}
            </span>
            <small>
              {player.picks.length} drafted, {player.bans.length} banned
            </small>
            <span className={player.ready ? 'is-ready' : 'is-waiting'}>{player.ready ? 'Ready' : 'Not ready'}</span>
          </li>
        ))}
        {state.requests.map((request) => (
          <li key={request.id} className="is-request">
            <RequestMark request={request} size={2} />
            <span>{request.name}</span>
            <small>asks for a seat</small>
            {current ? (
              <button type="button" className="dp-swap-action is-accept" disabled={open === 0} onClick={() => dispatch({ type: 'approve', request: request.id })}>
                Approve
              </button>
            ) : (
              <span className="is-waiting">awaiting approval</span>
            )}
          </li>
        ))}
        {Array.from({ length: open }, (_, index) => (
          <li key={`open-${index}`} className="is-open">
            <OpenSeat size={2} label={false} />
            <span>Open seat</span>
            <small>a spectator requests it; any player approves</small>
            <span />
          </li>
        ))}
      </ol>
      {state.players.length === 1 ? <p className="dp-hint">You are seated alone. Share the game link; players request a seat and you approve them here.</p> : null}
    </div>
  );
}

export function TabsPanel({ state, dispatch }: VariantProps) {
  const [tab, setTab] = useState<Tab>('factions');
  const current = me(state);
  const g = gates(state);
  const items: ConnectedTabsItem<Tab>[] = [
    { value: 'factions', label: 'Factions', icon: <Search size={16} aria-hidden />, panel: <FactionsTab state={state} dispatch={dispatch} /> },
    ...(current
      ? [
          {
            value: 'draft' as const,
            label: `Your draft (${current.picks.length})`,
            icon: <Hand size={16} aria-hidden />,
            panel: <DraftTab state={state} dispatch={dispatch} />,
          },
        ]
      : []),
    {
      value: 'seats',
      label: `Seats (${g.seated} of ${g.seatCount})`,
      icon: <Armchair size={16} aria-hidden />,
      indicator: state.requests.length > 0 ? <span className="dp-t__dot" aria-label="a request waits" /> : undefined,
      panel: <SeatsTab state={state} dispatch={dispatch} />,
    },
  ];
  const active = items.some((item) => item.value === tab) ? tab : 'factions';
  return (
    <div className="dp-panel dp-t">
      <SeatBar state={state} dispatch={dispatch} />
      <ConnectedTabs value={active} onValueChange={setTab} items={items} ariaLabel="Drafting panel" className="dp-t__tabs" />
      <footer className="dp-t__footer">
        <GatesReadout state={state} compact />
        <DraftNote state={state} />
        {current ? <ReadyButton state={state} dispatch={dispatch} /> : null}
      </footer>
    </div>
  );
}
