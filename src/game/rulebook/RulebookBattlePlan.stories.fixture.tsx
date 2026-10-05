import type { RulebookRenderBlockV1, RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';
import type { RulebookResolvedSource } from '@shared/rulebooks/sources';

import { factionTokenFixtures } from '../fixtures/factionTokens';
import type { RulebookBattlePlanProps, RulebookBattleSide } from './RulebookBattlePlan';

/* These five captured components supply teaching specimens, not a card catalogue. */
const pieces = {
  gurney: {
    height: 600,
    imageUrl:
      'https://dune.zone/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.01f1cf94-2df1-4b96-9fbf-dd757afef27b/leader.jpg?v=fca62d74-7a13-4d83-9725-3f248085ea22',
    name: 'Gurney Halleck',
    publicationRevision: 'fca62d74-7a13-4d83-9725-3f248085ea22',
    reference: {
      factionId: 'k17ag3gr1h60n7mmh88kj56avs8a1j7x',
      kind: 'faction-member',
      memberId: '01f1cf94-2df1-4b96-9fbf-dd757afef27b',
    },
    status: 'ready',
    width: 600,
  },
  feyd: {
    height: 600,
    imageUrl:
      'https://dune.zone/published/leaders/k174k8mvjqapvgccxtbp9qwh5h8a01b4.773ba210-69e1-4bcb-9ea8-2b5419ecd35e/leader.jpg?v=4e0674f3-0705-40c6-8e3f-5ff8abb57f74',
    name: 'Feyd Rautha',
    publicationRevision: '4e0674f3-0705-40c6-8e3f-5ff8abb57f74',
    reference: {
      factionId: 'k174k8mvjqapvgccxtbp9qwh5h8a01b4',
      kind: 'faction-member',
      memberId: '773ba210-69e1-4bcb-9ea8-2b5419ecd35e',
    },
    status: 'ready',
    width: 600,
  },
  pistol: {
    status: 'ready',
    reference: {
      kind: 'asset',
      assetId: 'ns785225ways2hbtape9wcb16d8fnp11',
    },
    name: 'Maula Pistol',
    imageUrl:
      'https://dune.zone/published/cards/ns785225ways2hbtape9wcb16d8fnp11/card.jpg?v=749ce499-1c78-4a46-a4fd-e00605997131',
    assetType: 'card-treachery',
  },
  snooper: {
    status: 'ready',
    reference: {
      kind: 'asset',
      assetId: 'ns7ahq18ww5e3b7hsdb3ztjggn8cwn08',
    },
    name: 'Snooper',
    imageUrl:
      'https://dune.zone/published/cards/ns7ahq18ww5e3b7hsdb3ztjggn8cwn08/card.jpg?v=a1b8c3c1-2d15-4b26-b575-8e3bc0484ff1',
    assetType: 'card-treachery',
  },
  poison: {
    status: 'ready',
    reference: {
      kind: 'asset',
      assetId: 'ns77am58gm55e9nw0y6mj45nbh8fmya3',
    },
    name: 'Gom Jabbar',
    imageUrl:
      'https://dune.zone/published/cards/ns77am58gm55e9nw0y6mj45nbh8fmya3/card.jpg?v=ae686d13-1fab-47a5-873a-d8a8d88bfb7b',
    assetType: 'card-treachery',
  },
} satisfies Record<string, RulebookResolvedSource>;

export const atreidesSide = {
  name: 'Atreides',
  role: 'Aggressor',
  artwork: factionTokenFixtures.atreides,
  revealed: false,
  plan: {
    strength: 3,
    spice: 2,
    adjustment: 0,
    troops: [
      {
        id: 'ordinary',
        name: 'Ordinary troops',
        dialed: 2,
        undialed: 2,
        artwork: {
          background: factionTokenFixtures.atreides.background,
          image: '/vector/troop/atreides.svg',
          star: undefined,
          hue: undefined,
          striped: undefined,
        },
      },
    ],
    leader: pieces.gurney,
    cards: [pieces.pistol, pieces.snooper],
  },
} satisfies RulebookBattleSide;
export const harkonnenSide = {
  name: 'Harkonnen',
  role: 'Defender',
  artwork: factionTokenFixtures.harkonnen,
  revealed: false,
  plan: {
    strength: 4,
    spice: 4,
    adjustment: 0,
    troops: [
      {
        id: 'ordinary',
        name: 'Ordinary troops',
        dialed: 4,
        undialed: 0,
        artwork: {
          background: factionTokenFixtures.harkonnen.background,
          image: '/vector/troop/harkonnen.svg',
          star: undefined,
          hue: undefined,
          striped: undefined,
        },
      },
    ],
    leader: pieces.feyd,
    cards: [pieces.poison, pieces.snooper],
  },
} satisfies RulebookBattleSide;

export const presciencePanel = {
  step: '3',
  title: 'Ask with Battle Prescience',
  caption: 'Atreides asks which weapon Harkonnen will play. The answer is binding. Everything else stays secret.',
  left: atreidesSide,
  right: { ...harkonnenSide, knownCard: pieces.poison },
  dialogue: [
    { speaker: 'left', text: 'Which weapon will you play?' },
    { speaker: 'right', text: 'Gom Jabbar.' },
  ],
} satisfies RulebookBattlePlanProps;

export const planningPanel = {
  step: '4',
  title: 'Atreides plans in secret',
  caption:
    'Knowing the poison weapon, Atreides chooses a Snooper. Four troops are committed: two supported and two unsupported.',
  left: { ...atreidesSide, revealed: true },
  right: { ...harkonnenSide, knownCard: pieces.poison },
  outcome: "Atreides dials 3 strength and commits 2 spice. This panel shows the Atreides player's private plan.",
} satisfies RulebookBattlePlanProps;

export const revealPanel = {
  step: '5',
  title: 'Reveal together',
  caption:
    'Both players reveal their plans at the same time. Neither calls a traitor. Now compare the weapons with the opposing defenses.',
  left: { ...atreidesSide, revealed: true },
  right: { ...harkonnenSide, revealed: true },
  dialogue: [
    { speaker: 'left', text: 'No traitor.' },
    { speaker: 'right', text: 'No traitor.' },
  ],
} satisfies RulebookBattlePlanProps;

export const deathPanel = {
  step: '6',
  title: 'Resolve the weapons',
  caption:
    'The Atreides Snooper stops Gom Jabbar. The Harkonnen Snooper cannot stop the Maula Pistol. Feyd is killed; Gurney survives.',
  left: { ...atreidesSide, revealed: true, result: 'Gurney survives' },
  right: {
    ...harkonnenSide,
    revealed: true,
    plan: { ...harkonnenSide.plan, leaderKilled: true },
    result: 'Feyd goes to the Tanks',
  },
  outcome: 'A killed leader contributes no strength. The troops still contribute their dialed strength.',
} satisfies RulebookBattlePlanProps;

export const resultPanel = {
  step: '7',
  title: 'Add strength and find the winner',
  caption:
    "Atreides adds Gurney's 4 strength to the dial of 3. Harkonnen adds nothing for the killed leader to the dial of 4.",
  left: { ...atreidesSide, revealed: true, result: '3 + 4 = 7' },
  right: { ...harkonnenSide, revealed: true, plan: { ...harkonnenSide.plan, leaderKilled: true }, result: '4 + 0 = 4' },
  outcome: 'Atreides wins, 7 to 4. Settle troop losses, spice and other aftermath effects next.',
} satisfies RulebookBattlePlanProps;

function renderedSide(side: RulebookBattleSide): Extract<RulebookRenderBlockV1, { kind: 'battle-step' }>['left'] {
  return {
    faction: { status: 'ready', factionId: side.name, name: side.name, color: '#736448', token: side.artwork },
    role: side.role,
    revealed: side.revealed,
    dial: side.plan.strength,
    spice: side.plan.spice,
    adjustment: side.plan.adjustment,
    leader: side.plan.leader,
    leaderKilled: side.plan.leaderKilled,
    cards: [...side.plan.cards],
    knownCard: side.knownCard,
    result: side.result,
    troops: side.plan.troops.map((troop) => ({
      id: troop.id,
      troopId: '01234567-89ab-4cde-8f01-234567890abc',
      face: 'front',
      supported: troop.dialed,
      unsupported: troop.undialed,
      uncommitted: 0,
      artwork: {
        image: troop.artwork.image,
        star: troop.artwork.star,
        hue: troop.artwork.hue,
        striped: troop.artwork.striped,
        name: troop.name,
        description: '',
        count: 20,
      },
    })),
  };
}

export function renderedBattleStep(
  panel: RulebookBattlePlanProps,
  index: number
): Extract<RulebookRenderBlockV1, { kind: 'battle-step' }> {
  return {
    id: `step-${index}`,
    kind: 'battle-step',
    step: panel.step,
    title: panel.title,
    caption: panel.caption,
    dialogue: panel.dialogue ? [...panel.dialogue] : undefined,
    outcome: panel.outcome,
    showSideLabels: index === 0,
    left: renderedSide(panel.left),
    right: renderedSide(panel.right),
  };
}

export function battleSequencePage(
  panels: RulebookBattlePlanProps[]
): Extract<RulebookRenderPageV1, { layoutId: 'sequence' }> {
  return {
    id: 'battle-sequence',
    anchor: 'battle-sequence',
    title: 'An illustrated battle',
    layoutId: 'sequence',
    showHeading: true,
    controlValues: {},
    regions: [{ key: 'content', blocks: panels.map(renderedBattleStep) }],
  };
}
