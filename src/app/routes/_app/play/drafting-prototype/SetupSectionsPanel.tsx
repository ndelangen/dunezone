/* PROTOTYPE (#1146, variant "setup-sections"): one column of sections in a fixed order under a phase strip that stays put; the panel scrolls. Throwaway; never merged. */
import { activePhase, readiness } from './setup';
import { Conversations, FactionInventory, Hand, PhaseControls, PhaseMark, PredictionLock, SeatRoster, SectionTitle, SharedInventory, VacancyBar } from './setupParts';
import type { SetupProps } from './setupParts';

export function SetupSectionsPanel({ state, dispatch }: SetupProps) {
  const phase = activePhase(state);
  const r = readiness(state);
  const unread = state.conversations.reduce((sum, conversation) => sum + conversation.unread, 0);
  return (
    <div className="dp-panel ds-sections">
      <div className="ds-strip">
        <PhaseMark symbol={phase.symbol} size={2.6} />
        <span className="ds-strip__copy">
          <strong>{phase.label}</strong>
          <small>{phase.instructions}</small>
        </span>
        <PhaseControls state={state} dispatch={dispatch} />
      </div>
      <VacancyBar state={state} dispatch={dispatch} />
      {phase.kind === 'builtin' ? (
        <section className="ds-section" aria-label="Prediction">
          <SectionTitle>Prediction</SectionTitle>
          <PredictionLock state={state} dispatch={dispatch} />
        </section>
      ) : null}
      <section className="ds-section" aria-label="Seats">
        <SectionTitle aside={phase.kind === 'instructions' ? undefined : `Ready ${r.ready} of ${r.seated}`}>Seats</SectionTitle>
        <SeatRoster state={state} />
      </section>
      {phase.id === 'traitors' ? (
        <section className="ds-section" aria-label="Your hand">
          <SectionTitle aside={`${state.hand.length} cards, private`}>Your hand</SectionTitle>
          <Hand state={state} size={0.18} />
        </section>
      ) : null}
      <section className="ds-section" aria-label="Your inventory">
        <SectionTitle aside="private">Your inventory</SectionTitle>
        <FactionInventory state={state} size={4.6} />
      </section>
      <section className="ds-section" aria-label="Shared inventory">
        <SectionTitle aside={state.requests.length ? `${state.requests.length} pending` : 'public'}>Shared inventory</SectionTitle>
        <SharedInventory state={state} dispatch={dispatch} />
      </section>
      {phase.kind === 'builtin' ? null : (
        <section className="ds-section" aria-label="Prediction">
          <SectionTitle>Prediction</SectionTitle>
          <PredictionLock state={state} dispatch={dispatch} />
        </section>
      )}
      <section className="ds-section" aria-label="Messages">
        <SectionTitle aside={unread ? `${unread} unread` : undefined}>Messages</SectionTitle>
        <Conversations state={state} />
      </section>
    </div>
  );
}
