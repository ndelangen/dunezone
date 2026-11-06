import { use } from 'react';

import { useTabletopSelector } from '../../../../../widgets/tabletop/TabletopContext';
import { CompassTableContext } from '../../compass/compassTable';
import { commandsOf } from '../../compass/shortcuts';
import type { Command } from '../../compass/shortcuts';
import type { Now } from './keyboardShortcuts';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

const COMMANDS: readonly Command[] = ['raise', 'lower', 'pass', 'faceUp'];

/**
 * What holds at the table for the viewer, by the same checks the keys' handlers run: a carried piece, a resting piece under the pointer or selected (the table skips resting-piece keys while carrying), and each bidding command the table offers this moment.
 */
function useShortcutMoment(): readonly Now[] {
  const carrying = useTabletopSelector((table) => table.state.draftMove != null);
  const onPiece = useTabletopSelector((table) => table.hoveredPieceId != null || table.selectedPiece != null);
  const commands = commandsOf(use(CompassTableContext));
  return [
    ...(carrying ? (['carrying'] as const) : []),
    ...(onPiece && !carrying ? (['piece'] as const) : []),
    ...COMMANDS.filter((command) => commands[command] !== null),
  ];
}

/** The keyboard shortcuts window as the hosted table shows it: the keys for the moment the viewer is in come first. */
export function ConnectedKeyboardShortcutsPanel() {
  return <KeyboardShortcutsPanel now={useShortcutMoment()} />;
}
