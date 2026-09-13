import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';

import duncan from './fixtures/faction-introduction/duncan.jpg?url';
import gurney from './fixtures/faction-introduction/gurney.jpg?url';
import jessica from './fixtures/faction-introduction/jessica.jpg?url';
import thufir from './fixtures/faction-introduction/thufir.jpg?url';
import yueh from './fixtures/faction-introduction/yueh.jpg?url';

/* These complete tokens were captured from the faction sheet renderer's Supply and spice story. */
export function factionIntroductionFixture(): Extract<RulebookRenderBlockV1, { kind: 'faction-introduction' }> {
  const leaders = [
    { name: 'Dr. Yueh', imageUrl: yueh },
    { name: 'Duncan Idaho', imageUrl: duncan },
    { name: 'Gurney Halleck', imageUrl: gurney },
    { name: 'Thufir Hawat', imageUrl: thufir },
    { name: 'Lady Jessica', imageUrl: jessica },
  ].map((leader, index) => ({
    ...leader,
    status: 'ready' as const,
    reference: {
      kind: 'faction-member' as const,
      factionId: 'atreides',
      memberId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    },
  }));
  return {
    id: 'FACT',
    kind: 'faction-introduction',
    text: 'The Atreides rely on knowledge to choose their battles. Their limited prescience reveals information about the cards and plans of their opponents.\n\nLed by Lady Jessica, they turn this knowledge into an advantage on Arrakis.',
    faction: {
      status: 'ready',
      factionId: 'atreides',
      name: 'Atreides',
      color: '#4b4c0d',
      emblemUrl: '/vector/logo/atreides.svg',
      ruler: leaders[4],
      leaders,
    },
  };
}
