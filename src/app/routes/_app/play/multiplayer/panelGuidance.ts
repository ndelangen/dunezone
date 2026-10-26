import { phaseAt } from '@shared/play/phases';
import type { setupStep } from '@shared/play/setup';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/*
 * What each panel of the table's controls says about itself.
 * The window's (?) gives the one-line description and the full help under it, and the compass's search shows the description as a hint;
 * the section the window holds keeps the same help for assistive technology, so both read from here.
 */

type Guidance = Readonly<{ description: string; help?: string }>;

const SETUP_PREVIOUS = 'Previous changes the setup phase only. Completed actions and pieces stay as they are.';

export function setupHelp(step: ReturnType<typeof setupStep>) {
  return [
    step.instructions,
    step.kind === 'prediction' &&
      'Locking is final. Only your faction can see the choice until you reveal it or place its card on the table.',
    SETUP_PREVIOUS,
  ]
    .filter(Boolean)
    .join(' ');
}

export function setupGuidance(step: ReturnType<typeof setupStep>): Guidance {
  return { description: step.title, help: setupHelp(step) };
}

export const HAND_HELP =
  'Drag a piece onto the table to play it face down. Right-click a piece to play it in front of you or move it to your private side-table. Hold Alt over a piece to see it close up.';

export const HAND_GUIDANCE: Guidance = { description: 'Your cards and leaders. Only you see them.', help: HAND_HELP };

export const HIDDEN_ZONE_HELP =
  "For pieces that need to sit in a particular spot, such as a marker on a card's track. Lay out pieces from your hand anywhere here; they stay where you put them. Q and E turn the piece under the pointer. Scroll over it to zoom in on the spot under the pointer, drag its felt to look around, and double-click the felt or a card to zoom back out. Cards stay below tokens. Pieces stay inside it as you drag them; right-click a piece to place it on the table face down, or to move it back to your hand.";

export const HIDDEN_ZONE_GUIDANCE: Guidance = {
  description: 'Your own small table for pieces that need a specific place. Only you see it.',
  help: HIDDEN_ZONE_HELP,
};

export function battleHelp(table: TableProjection) {
  const { battle } = table.snapshot;
  return battle ? `Battle at ${battle.territory}` : 'Drag the battle marker onto a territory to begin.';
}

export function battleGuidance(table: TableProjection): Guidance {
  return { description: 'The battle on the table and your private plan.', help: battleHelp(table) };
}

export const ALLIANCES_HELP =
  'Offer an alliance to another faction. Once it accepts, the table shows you as allies until one of you breaks the alliance. Your ruleset decides when alliances may form and how large they may grow.';

export const ALLIANCES_GUIDANCE: Guidance = {
  description: 'Offer, accept and break alliances.',
  help: ALLIANCES_HELP,
};

export const SHARED_INVENTORY_HELP = 'Drag an item onto the table. It lands face down.';

export const SHARED_INVENTORY_GUIDANCE: Guidance = {
  description: 'Pieces every player can take.',
  help: SHARED_INVENTORY_HELP,
};

export const SPICE_RESERVE_HELP =
  'Only you see this balance. Withdraw onto the table. Right-click a spice stack to take it into your spice reserve. Drop a stack on the Spice Bank disc to return it to the Spice Bank.';

export const SPICE_GUIDANCE: Guidance = {
  description: 'Your private spice reserve.',
  help: SPICE_RESERVE_HELP,
};

export const LOG_GUIDANCE: Guidance = { description: 'What happened at this table, newest first.' };

export const GAME_LOG_GUIDANCE: Guidance = {
  description: 'Phases, spice, battles, predictions, alliances and deleted pieces.',
};

export const AUDIT_LOG_GUIDANCE: Guidance = { description: 'Seats and removal votes.' };

export function phaseHelp(table: TableProjection) {
  const phase = phaseAt(table.snapshot.phase, table.snapshot.phases);
  return table.snapshot.stage === 'finished' || !table.snapshot.stage
    ? phase.instructions
    : `${phase.instructions} Previous changes the tracker only. Pieces and storm position stay as they are.`;
}

/** The Phase panel's guidance; a fixture table without a stage keeps its plain Table panel. */
export function phaseGuidance(table: TableProjection): Guidance | undefined {
  if (!table.snapshot.stage) {
    return undefined;
  }
  const phase = phaseAt(table.snapshot.phase, table.snapshot.phases);
  return { description: `${phase.label}, instructions and actions.`, help: phaseHelp(table) };
}

export const CONVERSATION_HELP = 'Sent means saved. No read receipts.';

export const TABLE_CONVERSATION_GUIDANCE: Guidance = {
  description: 'Messages to every seated faction.',
  help: CONVERSATION_HELP,
};

export const PLAYER_CONVERSATION_GUIDANCE: Guidance = {
  description: 'Private messages with this faction.',
  help: CONVERSATION_HELP,
};

export const PLAYER_INFO_GUIDANCE: Guidance = { description: 'Their faction and seat, and any removal vote.' };

export const RESULT_GUIDANCE: Guidance = {
  description: 'Determine the winner, or see who won.',
  help: 'One player determines the winner during Mentat Pause and declares it; anyone holding a locked prediction can reveal it first. Once declared, any player can continue the game from Mentat Pause of this turn.',
};
