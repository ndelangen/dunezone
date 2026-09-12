/* PROTOTYPE (#1146, variant "setup-focus"): a rail with the steps and the seats, a focus area that shows only the current step's tool, and a strip of drawers for the rest, one open at a time. Throwaway; never merged. */
import { useState } from 'react';

import { activePhase } from './setup';
import { Conversations, FactionInventory, Hand, PhaseControls, PhaseCopy, PredictionLock, SeatRoster, SectionTitle, SharedInventory, Stepper, VacancyBar } from './setupParts';
import type { SetupProps } from './setupParts';

type Drawer = 'inventory' | 'shared' | 'messages' | null;

function Tool({ state, dispatch }: SetupProps) {
  const phase = activePhase(state);
  switch (phase.id) {
    case 'traitors':
      return <Hand state={state} size={0.2} />;
    case 'starting-forces':
      return <FactionInventory state={state} size={4.8} />;
    default:
      return phase.kind === 'builtin' ? <PredictionLock state={state} dispatch={dispatch} /> : null;
  }
}

export function SetupFocusPanel({ state, dispatch }: SetupProps) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const unread = state.conversations.reduce((sum, conversation) => sum + conversation.unread, 0);
  const toggle = (next: Drawer) => setDrawer((open) => (open === next ? null : next));
  return (
    <div className="dp-panel ds-focus">
      <VacancyBar state={state} dispatch={dispatch} />
      <div className="ds-focus__body">
        <aside className="ds-rail" aria-label="Steps and seats">
          <Stepper state={state} dispatch={dispatch} />
          <SectionTitle>Seats</SectionTitle>
          <SeatRoster state={state} compact />
        </aside>
        <section className="ds-focus__main" aria-label="Current step">
          <PhaseCopy state={state} size={4} />
          <Tool state={state} dispatch={dispatch} />
          <PhaseControls state={state} dispatch={dispatch} stacked />
          {drawer ? (
            <div className="ds-drawer" aria-label="Open drawer">
              {drawer === 'inventory' ? (
                <>
                  <SectionTitle aside="private">Your inventory</SectionTitle>
                  <FactionInventory state={state} size={4.2} />
                </>
              ) : null}
              {drawer === 'shared' ? (
                <>
                  <SectionTitle aside={state.requests.length ? `${state.requests.length} pending` : 'public'}>Shared inventory</SectionTitle>
                  <SharedInventory state={state} dispatch={dispatch} />
                </>
              ) : null}
              {drawer === 'messages' ? (
                <>
                  <SectionTitle aside={unread ? `${unread} unread` : undefined}>Messages</SectionTitle>
                  <Conversations state={state} />
                </>
              ) : null}
            </div>
          ) : null}
          <div className="ds-drawers" role="tablist" aria-label="Drawers">
            <button type="button" role="tab" aria-selected={drawer === 'inventory'} className="dp-swap-action" onClick={() => toggle('inventory')}>
              Inventory
            </button>
            <button type="button" role="tab" aria-selected={drawer === 'shared'} className="dp-swap-action" onClick={() => toggle('shared')}>
              Shared{state.requests.length ? <span className="ds-unread">{state.requests.length}</span> : null}
            </button>
            <button type="button" role="tab" aria-selected={drawer === 'messages'} className="dp-swap-action" onClick={() => toggle('messages')}>
              Messages{unread ? <span className="ds-unread">{unread}</span> : null}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
