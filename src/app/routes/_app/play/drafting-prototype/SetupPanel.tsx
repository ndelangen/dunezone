/* PROTOTYPE (#1146, chosen for now): the setup panel. The phase with Ready across the top, then three columns that never move: yours, shared, table. Everything is visible at once. Throwaway; never merged. */
import { activePhase } from './setup';
import { Conversations, FactionInventory, Hand, PhaseControls, PhaseCopy, PredictionLock, SeatRoster, SectionTitle, SharedInventory, VacancyBar } from './setupParts';
import type { SetupProps } from './setupParts';

export function SetupPanel({ state, dispatch }: SetupProps) {
  const phase = activePhase(state);
  const unread = state.conversations.reduce((sum, conversation) => sum + conversation.unread, 0);
  return (
    <div className="dp-panel ds-setup">
      <VacancyBar state={state} dispatch={dispatch} />
      <section className="ds-setup__phase" aria-label="Current phase">
        <PhaseCopy state={state} />
        {phase.kind === 'builtin' ? <PredictionLock state={state} dispatch={dispatch} /> : null}
        <PhaseControls state={state} dispatch={dispatch} stacked />
      </section>
      <div className="ds-setup__body">
        <section className="ds-column" aria-label="Yours">
          <SectionTitle>{phase.id === 'traitors' ? 'Your hand' : 'Your inventory'}</SectionTitle>
          {phase.id === 'traitors' ? <Hand state={state} dispatch={dispatch} size={0.15} /> : null}
          {phase.id === 'traitors' ? <SectionTitle>Your inventory</SectionTitle> : null}
          <FactionInventory state={state} dispatch={dispatch} size={4.4} />
        </section>
        <section className="ds-column" aria-label="Shared">
          <SectionTitle aside={state.requests.length ? `${state.requests.length} pending` : undefined}>Shared inventory</SectionTitle>
          <SharedInventory state={state} dispatch={dispatch} />
        </section>
        <section className="ds-column" aria-label="Table">
          <SectionTitle>Seats</SectionTitle>
          <SeatRoster state={state} compact />
          <SectionTitle aside={unread ? `${unread} unread` : undefined}>Messages</SectionTitle>
          <Conversations state={state} />
        </section>
      </div>
    </div>
  );
}
