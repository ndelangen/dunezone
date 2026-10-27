import { snapshotFactionLabels } from '@shared/play/factionLabels';

import { battleStory } from '../../playing.stories.fixture';
import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { BattleHistoryPanel } from './BattleHistoryPanel';
import type { BattleHistoryPanelProps } from './BattleHistoryPanel';

/* The story battle at Arrakeen once both sides agreed the left side won, with a Treachery card on the winner's wheel. */
function agreedBattle(): BattleHistoryPanelProps {
  const snapshot = battleStory('revealed');
  const battle = snapshot.battle!;
  const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1)!;
  const plans = battle.revealed!;
  plans[0].pieces = [card];
  plans[0].cardIds = [card.id];
  return {
    results: [
      {
        id: battle.id,
        anchor: battle.anchor,
        territory: battle.territory,
        factions: ['house-harkonnen', 'house-atreides'],
        plans,
        outcome: 'left',
        revision: 1,
      },
    ],
    artwork: snapshot.factionArtwork,
    names: snapshotFactionLabels(snapshot),
  };
}

export const battleHistoryPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.battles),
  component: BattleHistoryPanel,
  args: agreedBattle(),
};
