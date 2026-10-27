import { phaseAt } from '@shared/play/phases';
import type { setupStep } from '@shared/play/setup';
import { helpLines } from '@ui/content/helpLines';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/*
 * What each panel of the table's controls says about itself.
 * The window's (?) gives the one-line description and the full help under it, and the compass's search shows the description as a hint;
 * the section the window holds keeps the same help for assistive technology, so both read from here.
 * Help is a few short lines, one thought each, joined by line breaks the tooltip keeps (Norbert, 2026-10-27: a wall of text helps nobody).
 * Keys stay out of it: the compass's key caps and the tutorial teach them.
 */

type Guidance = Readonly<{ description: string; help?: string }>;

const SETUP_PREVIOUS = 'Previous steps the setup back. Pieces stay put.';

export function setupHelp(step: ReturnType<typeof setupStep>) {
  return helpLines(
    step.instructions,
    step.kind === 'prediction' && 'Locking is final. Only you see the choice until you reveal it or play its card.',
    SETUP_PREVIOUS
  );
}

export function setupGuidance(step: ReturnType<typeof setupStep>): Guidance {
  return { description: step.title, help: setupHelp(step) };
}

/* Right-click menus name their own choices, so the help keeps to what a menu cannot show. */
export const HAND_HELP = 'Drag a piece onto the table to play it face down.';

export const HAND_GUIDANCE: Guidance = { description: 'Your cards and leaders. Only you see them.', help: HAND_HELP };

export const HIDDEN_ZONE_HELP = helpLines(
  "Drag pieces here from your hand. They stay where you lay them, such as a marker on a card's track.",
  'Scroll to zoom in, double-click to zoom back out.',
  'Right-click a piece to put it on the table or back in your hand.'
);

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

export const ALLIANCES_HELP = helpLines(
  'The table shows you as allies until one of you breaks it.',
  'Your ruleset decides when alliances may form and how large they grow.'
);

export const ALLIANCES_GUIDANCE: Guidance = {
  description: 'Offer, accept and break alliances.',
  help: ALLIANCES_HELP,
};

export const TINTS_HELP = helpLines(
  "Turn on a tint's paintbrush, then click territories on the board to add or remove them.",
  'Escape stops painting.'
);

export const TINTS_GUIDANCE: Guidance = { description: 'Colour territories for everyone to see.', help: TINTS_HELP };

export const SHARED_INVENTORY_HELP = 'Drag an item onto the table. It lands face down.';

export const SHARED_INVENTORY_GUIDANCE: Guidance = {
  description: 'Pieces every player can take.',
  help: SHARED_INVENTORY_HELP,
};

export const SPICE_RESERVE_HELP = helpLines(
  'Right-click a spice stack on the table to take it.',
  'Drop a stack on the Spice Bank disc to return it.'
);

export const SPICE_GUIDANCE: Guidance = {
  description: 'Your private spice reserve. Only you see it.',
  help: SPICE_RESERVE_HELP,
};

/** Hand and Spice share one window: one line for both, then the spice's help and the hand's, in the order the window shows them. */
export const HAND_AND_SPICE_GUIDANCE: Guidance = {
  description: 'Your cards, leaders and spice. Only you see them.',
  help: helpLines(SPICE_RESERVE_HELP, HAND_HELP),
};

export const LOG_GUIDANCE: Guidance = { description: 'What happened at this table, newest first.' };

export const GAME_LOG_GUIDANCE: Guidance = {
  description: 'Phases, spice, battles, predictions, alliances and deleted pieces.',
};

export const AUDIT_LOG_GUIDANCE: Guidance = { description: 'Seats and removal votes.' };

/** What Previous does once the game is under way, said in the Phase window and on a plain table alike. */
export const PHASE_PREVIOUS = 'Previous moves the tracker back. Pieces and storm stay put.';

export function phaseHelp(table: TableProjection) {
  const phase = phaseAt(table.snapshot.phase, table.snapshot.phases);
  return table.snapshot.stage === 'finished' || !table.snapshot.stage
    ? phase.instructions
    : helpLines(phase.instructions, PHASE_PREVIOUS);
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

export const FACTION_INFO_GUIDANCE: Guidance = {
  description: 'Each faction at the table: what it starts with, its seat, and any removal vote.',
  help: 'The tokens along the top switch between the factions.',
};

export const RESULT_GUIDANCE: Guidance = {
  description: 'Determine the winner, or see who won.',
  help: helpLines(
    'In Mentat Pause, one player declares the winner.',
    'A locked prediction can be revealed before that.',
    "Afterwards anyone can continue from this turn's Mentat Pause."
  ),
};
