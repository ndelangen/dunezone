import { restingPositionAt } from '../tableGeometry';
/* Local battle pieces enter the existing tabletop state, with faces captured through the real renderers. */
import type { LocalTableFixture } from '../TabletopContext';
import { BATTLE_FACTIONS } from './battle';
import type { BattleState } from './battle';
import chaumas from './battle-cards/chaumas.png?url';
import maulaPistol from './battle-cards/maulaPistol.png?url';
import shield from './battle-cards/shield.png?url';
import { factionById } from './fixture';
import { FACTION_LEADERS, leadersOf } from './leaders.fixture';

const CARD_FACES: Record<string, string> = { maulaPistol, shield, chaumas };
const CARD_NAMES: Record<string, string> = { maulaPistol: 'Maula Pistol', shield: 'Shield', chaumas: 'Chaumas' };

export function battleTableFixture(state: BattleState): LocalTableFixture {
  const pieces: LocalTableFixture['pieces'] = [];
  const faceUrls: Record<string, string> = {};
  for (const [side, plan] of state.plans.entries()) {
    const slug = BATTLE_FACTIONS[side];
    const faction = factionById(slug);
    const keys = [...plan.cards, ...(plan.leader ? ['leader'] : [])];
    for (const key of keys) {
      const source = `${side}:${key}`;
      const moved = state.moved.includes(source);
      if (!moved && !(key === 'leader' && state.stage === 'resolved')) {
        continue;
      }
      const leader = leadersOf(slug).find((candidate) => candidate.memberId === plan.leader);
      const id = `battle-${state.generation}-${side}-${key}`;
      const kind = key === 'leader' ? 'marker' : 'card';
      const position = moved
        ? state.positions[source]
        : ([state.anchor[0] + (side ? 0.6 : -0.6), 0.3, state.anchor[2] + 0.5] as [number, number, number]);
      pieces.push({
        id,
        kind,
        label: `${faction.name} ${key === 'leader' ? leader?.name : CARD_NAMES[key]}`,
        owner: 'shared',
        color: faction.colour,
        accent: '#f4dfb1',
        items: [{ id, faceUp: true }],
        stackKey: kind === 'card' ? 'battle-treachery' : null,
        position: restingPositionAt(position, { kind, orientation: 0 }),
        orientation: 0,
        zoneId: null,
        locked: false,
      });
      faceUrls[id] =
        key === 'leader'
          ? `https://dune.zone/published/leaders/${FACTION_LEADERS.find((candidate) => candidate.slug === slug)!.id}.${plan.leader}/leader.jpg`
          : CARD_FACES[key];
    }
  }
  return { key: state.scenario, pieces, faceUrls, readOnly: state.viewer === 'spectator' };
}
