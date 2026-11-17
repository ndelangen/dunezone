import { Notice } from '@ui/block/Notice';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Swords } from 'lucide-react';
import { createContext, useContext } from 'react';

/**
 * Opens the Battle plan panel while it is closed and the viewer could plan a battle;
 * null while it is open, or there is no plan to make (#2984).
 * The Hand and the battle on the board offer it, so a player who closed the planner finds it again without the compass.
 */
export const BattlePlanOpenerContext = createContext<(() => void) | null>(null);

/** The Battle plan opener, if the planner is closed and could be used now. */
export function useBattlePlanOpener() {
  return useContext(BattlePlanOpenerContext);
}

/*
 * Shown at the top of the Hand during a battle phase while the planner is closed.
 * The Hand stays the hand: its cards are not picked from here, so the note points to where they are (Norbert, 2026-11-17).
 */
export function BattlePlanHint() {
  const open = useBattlePlanOpener();
  if (!open) {
    return null;
  }
  return (
    <Notice
      tone="info"
      title="Battle phase"
      action={
        <LabeledAction size="compact-sm" icon={<Swords size={14} />} onClick={open}>
          Open battle plan
        </LabeledAction>
      }
    >
      Pick your leader and cards for this battle in the Battle plan.
    </Notice>
  );
}
