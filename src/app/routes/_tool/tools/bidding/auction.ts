import { auctionStateSchema, biddingActionSchema } from '@shared/tools/biddingSession';
import type { AuctionAction, AuctionState, BiddingFaction } from '@shared/tools/biddingSession';

export type AuctionDecision = Readonly<{ accepted: boolean; state: AuctionState; reason: string }>;
export type AuctionSetup = Readonly<{
  seats: readonly BiddingFaction[];
  ruleset: AuctionState['ruleset'];
  deck?: AuctionState['deck'];
  seconds?: number;
}>;

/** A phase starts with a suggested card count until the table chooses its own. */
export function createAuction({ seats, ruleset, deck = null, seconds = 15 }: AuctionSetup): AuctionState {
  return auctionStateSchema.parse({
    seats: seats.map((seat) => ({ ...seat })),
    ruleset,
    deck,
    stage: 'setup',
    controlMode: 'automatic',
    resumeStage: null,
    turn: null,
    opener: null,
    starter: seats.find((seat) => !seat.full)?.id ?? seats[0]?.id,
    high: null,
    passed: [],
    cards: seats.filter((seat) => !seat.full).length,
    cardsChosen: false,
    card: 1,
    phase: 1,
    results: [],
    seconds,
    opportunity: 0,
    note: '',
  });
}

/** The fixed seating order supplies the next suggested starter, independently of the winner. */
function nextNonFull(state: AuctionState, after: string | null): string {
  const start = state.seats.findIndex((seat) => seat.id === after);
  for (let step = 1; step <= state.seats.length; step += 1) {
    const candidate = state.seats[(start + step) % state.seats.length];
    if (!candidate.full) {
      return candidate.id;
    }
  }
  return state.seats[0].id;
}

function factionName(state: AuctionState, id: string | null): string {
  return state.seats.find((seat) => seat.id === id)?.name ?? 'Player';
}

function adjacentFaction(state: AuctionState, after: string | null, direction = 1): string {
  const index = state.seats.findIndex((seat) => seat.id === after);
  return state.seats[(index + direction + state.seats.length) % state.seats.length].id;
}

function suggestedCards(state: AuctionState): number {
  return state.controlMode === 'manual' ? state.seats.length : state.seats.filter((seat) => !seat.full).length;
}

function nextStarter(state: AuctionState): string {
  return state.controlMode === 'manual' ? adjacentFaction(state, state.opener) : nextNonFull(state, state.opener);
}

function awaitingFirstAuction(state: AuctionState): boolean {
  const stage = state.stage === 'paused' ? state.resumeStage : state.stage;
  return stage === 'ready' && state.opener === null && state.card === 1;
}

function finished(state: AuctionState, note: string): AuctionState {
  return { ...state, stage: 'over', resumeStage: null, turn: null, high: null, passed: [], note };
}

function award(state: AuctionState): AuctionState {
  const high = state.high;
  if (!high) {
    return finished(state, 'Everyone passed. Return the unsold cards.');
  }
  const winner = state.seats.find((seat) => seat.id === high.id)!;
  const seats = state.seats.map((seat) =>
    seat.id === high.id ? { ...seat, hand: seat.hand + 1, full: seat.hand + 1 >= seat.limit } : seat
  );
  const payee = winner.paid ? undefined : state.seats.find((seat) => seat.paid);
  const note = `${winner.name} won card ${state.card} for ${high.amount} spice. Pay ${payee?.name ?? 'the bank'}. Hand count +1.`;
  const next: AuctionState = {
    ...state,
    seats,
    results: [
      ...state.results,
      { phase: state.phase, card: state.card, factionId: winner.id, name: winner.name, amount: high.amount },
    ],
    card: state.card + 1,
    high: null,
    passed: [],
    turn: null,
    note,
    stage:
      state.card >= state.cards || (state.controlMode !== 'manual' && seats.every((seat) => seat.full))
        ? 'over'
        : 'ready',
    resumeStage: null,
  };
  return { ...next, starter: nextStarter(next) };
}

/* A recorded high bid survives later hand edits, including its bidder marking Full. */
function progress(state: AuctionState, after: string | null, includeAfter = false): AuctionState {
  const eligible = state.seats.filter((seat) => !seat.full);
  if (eligible.length === 0) {
    return state.high ? award(state) : finished(state, 'No factions are available to bid.');
  }
  const passed = new Set(state.passed);
  const start = state.seats.findIndex((seat) => seat.id === after);
  for (let step = includeAfter ? 0 : 1; step < state.seats.length + (includeAfter ? 0 : 1); step += 1) {
    const candidate = state.seats[(start + step + state.seats.length) % state.seats.length];
    if (candidate.full || candidate.id === state.high?.id || passed.has(candidate.id)) {
      continue;
    }
    if (candidate.pass) {
      passed.add(candidate.id);
      continue;
    }
    return { ...state, turn: candidate.id, passed: [...passed] };
  }
  return state.high
    ? award({ ...state, passed: [...passed] })
    : finished(state, 'Everyone passed. Return the unsold cards.');
}

function refused(state: AuctionState, reason: string): AuctionDecision {
  return { accepted: false, state, reason };
}

function decided(before: AuctionState, next: AuctionState, reason: string, newOpportunity = false): AuctionDecision {
  const state = newOpportunity ? { ...next, opportunity: before.opportunity + 1 } : next;
  const parsed = auctionStateSchema.safeParse(state);
  return parsed.success
    ? { accepted: true, state: parsed.data, reason }
    : refused(before, 'This action exceeds the saved table limits.');
}

function editHand(
  state: AuctionState,
  action: Extract<AuctionAction, { type: 'edit-hand' | 'edit-status' }>
): AuctionDecision {
  const seat = state.seats.find((candidate) => candidate.id === action.id);
  if (!seat) {
    return refused(state, 'That faction is not at this table.');
  }
  if (seat[action.field] === action.value) {
    return decided(state, state, 'Hand information is unchanged.');
  }
  const edited = { ...seat, [action.field]: action.value };
  if (action.type === 'edit-hand') {
    edited.full = edited.hand >= edited.limit;
  }
  let next = { ...state, seats: state.seats.map((candidate) => (candidate.id === action.id ? edited : candidate)) };
  if ((next.stage === 'setup' || awaitingFirstAuction(next)) && !next.cardsChosen) {
    next.cards = suggestedCards(next);
  }
  if (next.stage === 'active' && next.controlMode !== 'manual') {
    next = progress(next, next.turn, true);
  }
  return decided(
    state,
    next,
    `${seat.name}'s hand information changed.`,
    next.stage !== state.stage || next.turn !== state.turn
  );
}

/** All accepted changes pass through this decision path, including automatic persistent passes. */
export function applyAuctionAction(state: AuctionState, input: AuctionAction): AuctionDecision {
  const parsed = biddingActionSchema.safeParse(input);
  if (!parsed.success || parsed.data.type === 'assign') {
    return refused(state, 'That action is not valid.');
  }
  const action = parsed.data;
  switch (action.type) {
    case 'claim-moderator': {
      const next: AuctionState = { ...state, controlMode: 'manual', passed: [] };
      if (!next.cardsChosen) {
        next.cards = suggestedCards(next);
      }
      return decided(state, next, 'Moderator controls are active.', true);
    }
    case 'release-moderator':
      return decided(state, state, 'The phone left moderator mode. The table remains manual.', true);
    case 'set-control-mode': {
      const stage = state.stage === 'paused' ? state.resumeStage : state.stage;
      if (state.controlMode !== 'manual' || stage === 'active') {
        return refused(state, 'Return to automatic bidding between card auctions.');
      }
      const next: AuctionState = { ...state, controlMode: 'automatic' };
      if (!next.cardsChosen) {
        next.cards = suggestedCards(next);
      }
      return decided(state, next, 'Automatic bidding is active.', true);
    }
    case 'back':
    case 'advance': {
      if (state.controlMode !== 'manual' || state.stage !== 'active' || !state.turn) {
        return refused(state, 'Start or resume a manual card auction first.');
      }
      const turn = adjacentFaction(state, state.turn, action.type === 'back' ? -1 : 1);
      return decided(state, { ...state, turn }, `${factionName(state, turn)} is selected.`, true);
    }
    case 'raise-one': {
      if (state.controlMode !== 'manual' || state.stage !== 'active' || !state.turn) {
        return refused(state, 'Start or resume a manual card auction first.');
      }
      const amount = (state.high?.amount ?? 0) + 1;
      return decided(
        state,
        { ...state, high: { id: state.turn, amount } },
        `${factionName(state, state.turn)} bid ${amount}.`,
        true
      );
    }
    case 'confirm-winner': {
      if (state.controlMode !== 'manual' || state.stage !== 'active' || !state.high) {
        return refused(state, 'Record a bid in an active manual auction before confirming its winner.');
      }
      return decided(state, award(state), 'The winning bid was confirmed.', true);
    }
    case 'end-phase': {
      if (
        state.controlMode !== 'manual' ||
        (state.stage !== 'active' && state.stage !== 'ready') ||
        state.high !== null
      ) {
        return refused(state, 'End a manual phase only when no bid is recorded.');
      }
      return decided(
        state,
        finished(state, 'The moderator ended the phase. Return the unsold cards.'),
        'The phase ended.',
        true
      );
    }
    case 'bid': {
      if (state.controlMode === 'manual') {
        return refused(state, 'The moderator controls this auction.');
      }
      if (state.stage !== 'active' || !state.turn) {
        return refused(state, 'Wait for the table to start or resume bidding.');
      }
      if (action.amount <= (state.high?.amount ?? 0)) {
        return refused(state, `Bid at least ${(state.high?.amount ?? 0) + 1}.`);
      }
      const name = factionName(state, state.turn);
      const next = progress({ ...state, high: { id: state.turn, amount: action.amount }, passed: [] }, state.turn);
      return decided(state, next, `${name} bid ${action.amount}.`, true);
    }
    case 'pass': {
      if (state.controlMode === 'manual') {
        return refused(state, 'The moderator controls this auction.');
      }
      if (state.stage !== 'active' || !state.turn) {
        return refused(state, 'Wait for the table to start or resume bidding.');
      }
      const name = factionName(state, state.turn);
      const next = progress({ ...state, passed: [...new Set([...state.passed, state.turn])] }, state.turn);
      return decided(state, next, `${name} passed.`, true);
    }
    case 'finish-setup': {
      if (state.stage !== 'setup') {
        return refused(state, 'Table setup is already complete.');
      }
      return decided(state, { ...state, stage: 'ready' }, 'The table is ready to start bidding.', true);
    }
    case 'start': {
      if (state.stage !== 'ready') {
        return refused(state, 'Finish setup or the current auction before starting a card.');
      }
      if (state.cards === 0) {
        return decided(state, finished(state, 'No cards were chosen for this phase.'), 'The phase is complete.', true);
      }
      const peeker = state.seats.find((seat) => seat.peeks);
      const started: AuctionState = {
        ...state,
        stage: 'active',
        resumeStage: null,
        opener: state.starter,
        turn: state.starter,
        high: null,
        passed: [],
        cardsChosen: true,
        note: peeker ? `${peeker.name} looks first.` : '',
      };
      const next = state.controlMode === 'manual' ? started : progress(started, state.starter, true);
      return decided(state, next, 'The card auction started.', true);
    }
    case 'reset': {
      if (state.stage !== 'active' && !(state.stage === 'paused' && state.resumeStage === 'active')) {
        return refused(state, 'There is no current card auction to reset.');
      }
      return decided(
        state,
        {
          ...state,
          stage: 'ready',
          resumeStage: null,
          turn: null,
          high: null,
          passed: [],
          starter: nextStarter(state),
          note: 'This card auction was reset. Choose the next starter.',
        },
        'The current card auction was reset.',
        true
      );
    }
    case 'pause': {
      if (state.stage === 'paused') {
        return refused(state, 'The table is already paused.');
      }
      return decided(
        state,
        { ...state, stage: 'paused', resumeStage: state.stage, note: 'Check the table, then Resume.' },
        'The table is paused.',
        true
      );
    }
    case 'resume': {
      if (state.stage !== 'paused' || state.resumeStage === null) {
        return refused(state, 'The table is not paused.');
      }
      let next: AuctionState = { ...state, stage: state.resumeStage, resumeStage: null, note: '' };
      if (next.stage === 'active' && next.controlMode !== 'manual') {
        next = progress(next, next.turn, true);
      }
      return decided(state, next, 'The table resumed.', true);
    }
    case 'next-phase': {
      if (state.stage !== 'over') {
        return refused(state, 'Finish this phase first.');
      }
      return decided(
        state,
        {
          ...state,
          stage: 'ready',
          resumeStage: null,
          phase: state.phase + 1,
          card: 1,
          cards: suggestedCards(state),
          cardsChosen: false,
          turn: null,
          opener: null,
          high: null,
          passed: [],
          starter:
            state.seats.find((seat) => seat.id === state.starter && (state.controlMode === 'manual' || !seat.full))
              ?.id ?? nextNonFull(state, state.starter),
          note: '',
        },
        'The next phase is ready to start.',
        true
      );
    }
    case 'select-starter': {
      if (state.stage !== 'setup' && state.stage !== 'ready') {
        return refused(state, 'Choose the starter before starting a card.');
      }
      if (!state.seats.some((seat) => seat.id === action.id)) {
        return refused(state, 'That faction is not at this table.');
      }
      return decided(state, { ...state, starter: action.id }, `${factionName(state, action.id)} is selected to start.`);
    }
    case 'edit-hand':
    case 'edit-status':
      return editHand(state, action);
    case 'configure': {
      if (
        state.stage !== 'setup' &&
        !(
          state.stage === 'ready' &&
          awaitingFirstAuction(state) &&
          action.seats === undefined &&
          action.ruleset === undefined &&
          action.deck === undefined
        )
      ) {
        return refused(state, 'Choose factions during setup and phase settings before its first auction.');
      }
      const seats = action.seats ?? state.seats;
      const cardsChosen = action.cards !== undefined || state.cardsChosen;
      const starter = seats.some((seat) => seat.id === state.starter)
        ? state.starter
        : (seats.find((seat) => !seat.full)?.id ?? seats[0].id);
      return decided(
        state,
        {
          ...state,
          seats,
          ruleset: action.ruleset ?? state.ruleset,
          deck: action.deck === undefined ? state.deck : action.deck,
          seconds: action.seconds ?? state.seconds,
          cards: action.cards ?? (cardsChosen ? state.cards : suggestedCards({ ...state, seats })),
          cardsChosen,
          starter,
        },
        'Table setup changed.'
      );
    }
  }
}

/** Recovery preserves the current auction but never resumes it without an explicit action. */
export function pauseForRecovery(state: AuctionState): AuctionState {
  return {
    ...state,
    stage: 'paused',
    resumeStage: state.stage === 'paused' ? state.resumeStage : state.stage,
    opportunity: state.opportunity + 1,
    note: 'Restored table. Check the hands and current bid, then Resume.',
  };
}
