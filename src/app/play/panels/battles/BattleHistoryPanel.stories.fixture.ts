import { isBattleLeader } from '@shared/play/battle';
import { snapshotFactionLabels } from '@shared/play/factionLabels';

import { battleStory } from '../../../routes/_app/play/playing.stories.fixture';
import { playingSnapshot } from '../../../routes/_app/play/product.stories.fixture';
import { scenario } from '../battlePlan/battlePlan.stories.fixture';
import { panelMeta } from '../PanelFrame.stories.fixture';
import { PANEL_INFO } from '../panelInfo';
import { BattleHistoryPanel } from './BattleHistoryPanel';
import type { BattleHistoryPanelProps } from './BattleHistoryPanel';

/* The story battle at Arrakeen once both sides agreed the left side won: Harkonnen's planned wheel against an Atreides leader and a lightly supported force. */
export function agreedBattle(): BattleHistoryPanelProps {
  const snapshot = battleStory('revealed');
  const battle = snapshot.battle!;
  const [harkonnen, atreides] = battle.revealed!;
  const planned = scenario('planned').plan;
  const leader = playingSnapshot('seat-1').hand!.find(isBattleLeader)!;
  const face = harkonnen.faces[0]!.id;
  const plans: typeof battle.revealed = [
    {
      ...harkonnen,
      troops: [{ faceId: face, undialed: 2, dialed: 4 }],
      spice: 4,
      strength: 5,
      leaderIds: planned.leaderIds,
      cardIds: planned.cardIds,
      pieces: planned.pieces,
    },
    {
      ...atreides,
      troops: [{ faceId: face, undialed: 3, dialed: 2 }],
      spice: 2,
      strength: 3.5,
      leaderIds: [leader.id],
      pieces: [leader],
    },
  ];
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
  ...panelMeta(PANEL_INFO.battles),
  component: BattleHistoryPanel,
  args: agreedBattle(),
};
