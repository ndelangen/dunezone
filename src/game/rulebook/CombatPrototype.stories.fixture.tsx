import type {
  RulebookRenderBlockV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from '@shared/rulebooks/renderDocument';
import { rulebookRenderDocumentV1Schema } from '@shared/rulebooks/renderDocument';

import data from './CombatPrototype.stories.fixture.json';
import {
  deathPanel,
  preparationPanel,
  presciencePanel,
  renderedBattleStep,
} from './RulebookBattlePlan.stories.fixture';
import { RulebookDocumentRenderer } from './RulebookRenderer';

/* The chapter uses the saved rulebook contract and its normal renderer. */
type Block = RulebookRenderBlockV1;
type Page = RulebookRenderPageV1;
type Scene = 'hidden' | 'prescience' | 'dial' | 'reveal' | 'weapons' | 'total' | 'spite' | 'cards' | 'losses';
const scenes: Record<Scene, { n: number; lead: string; rule: string; example: string }> = {
  hidden: {
    n: 2,
    lead: 'Prepare a battle plan.',
    rule: 'Your plan may include up to one weapon, one defense and one Mercenaries card. Each has its own slot, and any slot may be empty. Keep the cards and their number secret until reveal, except for information disclosed by an advantage.',
    example: '',
  },
  prescience: {
    n: 3,
    lead: 'Resolve pre-reveal advantages.',
    rule: "Follow each applicable faction advantage's timing and conditions. The Voice precedes Battle Prescience, followed by Blackmail and Stone Burner. Fanatical Tactics and Infiltration act during commitment. Emperor and Ixian Fates cannot be used during commitment.",
    example:
      'Atreides asks: "Which weapon will you play?" Harkonnen answers "Gom Jabbar." *That part* of Harkonnen\'s battle plan is now locked, and cannot be changed. The rest can change until reveal. Atreides uses the answer to choose two cards.',
  },
  dial: {
    n: 4,
    lead: 'Dial troop strength; set aside support spice.',
    rule: 'An ordinary troop gives \u00bd strength unsupported, or 1 with 1 spice of support. Dial a total your troops and spice can supply, excluding the leader. For a half point, align the mark between whole numbers with the window.',
    example:
      'Two supported troops plus two unsupported supply 3 strength for 2 spice. The other two Atreides troops contribute nothing.',
  },
  reveal: {
    n: 5,
    lead: 'Reveal both final plans together.',
    rule: 'Finish pre-reveal abilities, then reveal both plans simultaneously.',
    example:
      'Atreides reveals dial 3, 2 spice and Gurney. Harkonnen reveals dial 4, 4 spice and Feyd. Both reveal their weapon and defense.',
  },
  weapons: {
    n: 5,
    lead: 'Resolve both weapons against the opposing defenses.',
    rule: 'An unblocked weapon kills the opposing leader. A killed leader contributes 0 strength; its troops still count. Winning does not itself save your leader.',
    example:
      "Gurney's Snooper stops Gom Jabbar. Feyd's Snooper cannot stop the Maula Pistol, so Feyd dies. The red cross marks his death.",
  },
  total: {
    n: 6,
    lead: 'Add strength and determine the winner.',
    rule: 'Add the troop dial, surviving leader and permitted bonuses. Higher strength wins. The aggressor normally wins ties; Mercenaries can change that. Settle the result before cards and losses.',
    example: "Atreides has 3 + Gurney's 4 = 7. Harkonnen has 4 + 0 = 4. Atreides wins.",
  },
  spite: {
    n: 7,
    lead: 'Resolve post-reveal advantages at their stated time.',
    rule: "Faction advantages may act after reveal or after the result. Check each ability's timing and conditions before continuing.",
    example:
      "Feyd died, allowing Vladimir's Spite. Harkonnen exchanges Gom Jabbar for Atreides' Snooper. The result stays 7 to 4.",
  },
  cards: {
    n: 8,
    lead: 'Settle cards and the leader reward.',
    rule: "The ordinary winner may keep or discard played cards; the loser discards them. The winner collects the killed opposing leader's strength in spice.",
    example:
      'Atreides collects 6 spice and keeps its Pistol and new Gom Jabbar, which cannot be discarded immediately. Harkonnen discards both Snoopers.',
  },
  losses: {
    n: 9,
    lead: 'Pay support and remove troops last.',
    rule: 'Both pay committed spice. The winner loses troops matching its dial and payment; the loser loses all troops in the territory. Resolve any Harkonnen capture, then choose the next battle.',
    example:
      'Atreides pays 2 spice, loses four troops and keeps two. Harkonnen pays 4 spice and loses all five troops.',
  },
};

function text(id: string, copy: string, name?: string): Block {
  return { id, kind: 'text', name, text: copy };
}
function example(id: string, copy: string, title = 'Example'): Block {
  return { id, kind: 'callout', variant: 'example', title, text: copy };
}
function table(id: string, labels: string[], rows: string[][], note = ''): Block {
  const columns = labels.map((label, index) => ({ id: `column-${index}`, label }));
  return {
    id,
    kind: 'reference-table',
    columns,
    rows: rows.map((values, index) => ({
      id: `row-${index}`,
      cells: values.map((value, index) => ({ columnId: columns[index]!.id, text: value })),
    })),
    note,
  };
}
function single(id: string, title: string, blocks: Block[]): Extract<Page, { layoutId: 'single-column' }> {
  return {
    id,
    anchor: id,
    title,
    showHeading: true,
    headingIcon: '/vector/icon/combat.svg',
    layoutId: 'single-column',
    controlValues: {},
    regions: [{ key: 'content', blocks }],
  };
}
function columns(id: string, title: string, left: Block[], right: Block[]): Page {
  return {
    id,
    anchor: id,
    title,
    showHeading: true,
    headingIcon: '/vector/icon/combat.svg',
    layoutId: 'two-columns',
    controlValues: {},
    regions: [
      { key: 'column1', blocks: left },
      { key: 'column2', blocks: right },
    ],
  };
}
function band(id: string, title: string, top: Block[], left: Block[], right: Block[]): Page {
  return {
    id,
    anchor: id,
    title,
    showHeading: true,
    headingIcon: '/vector/icon/combat.svg',
    layoutId: 'band-columns',
    controlValues: { bandPosition: 'top' },
    regions: [
      { key: 'band', blocks: top },
      { key: 'column1', blocks: left },
      { key: 'column2', blocks: right },
    ],
  };
}

const board = data.board as Extract<Block, { kind: 'board-scene' }>;
const sourceBlocks = data.blocks as unknown as Record<string, Block>;
const preparing = {
  ...renderedBattleStep(preparationPanel, 2),
  caption: scenes.hidden.rule,
  showSideLabels: false,
};
const beforeReveal = {
  ...renderedBattleStep(presciencePanel, 3),
  title: 'Resolve pre-reveal advantages',
  caption: scenes.prescience.rule,
  dialogue: [],
  showSideLabels: false,
};
const revealed = {
  ...renderedBattleStep(deathPanel, 5),
  step: '5',
  title: 'Reveal and resolve weapons',
  caption: scenes.reveal.rule + ' ' + scenes.weapons.rule,
  dialogue: [],
  outcome: undefined,
  showSideLabels: false,
  left: { ...renderedBattleStep(deathPanel, 5).left, result: undefined },
  right: { ...renderedBattleStep(deathPanel, 5).right, result: undefined },
};
revealed.left.troops[0]!.uncommitted = 2;
revealed.right.troops[0]!.uncommitted = 1;
const spite = {
  ...sourceBlocks.SPTE,
  step: '7',
  outcome: undefined,
  title: 'Resolve post-reveal advantages',
  caption: scenes.spite.rule,
  notes: [],
} as Block;
const losses = {
  ...sourceBlocks.LSES,
  step: '9',
  outcome: undefined,
  title: 'Pay support and remove troops last',
  caption: scenes.losses.rule,
  board: undefined,
  notes: [],
} as Block;
const dialTable = table(
  'dial-calculation',
  ['Ordinary troops', 'Strength each', 'Contribution', 'Support spice'],
  [
    ['2 supported', '1', '2', '2'],
    ['2 unsupported', '½', '1', '0'],
    ['2 uncommitted', '0', '0', '0'],
    ['Total', '', 'Dial 3', '2 spice'],
  ]
);
const resultTable = table(
  'strength-totals',
  ['Faction', 'Troop dial', 'Leader', 'Total'],
  [
    ['Atreides', '3', 'Gurney survives: 4', '7, wins'],
    ['Harkonnen', '4', 'Feyd killed: 0', '4'],
  ]
);
const specialTable = table(
  'troop-strengths',
  ['Troop', 'Unsupported', 'With 1 spice', 'Exception'],
  [
    ['Ordinary', '½', '1', 'Standard support'],
    ['Sardaukar', '1', '2', 'Ordinary strength against Fremen'],
    ['Fremen ordinary / Fedaykin', '1 / 2', 'Not needed', 'Free Spice Dialing; apply Karama first'],
    ['Cyborg', '1', '2', 'Immune to Karama'],
    ['Suboid', '½', 'Cannot support', 'May replace a Cyborg loss after winning'],
    ['Patched Cyborg', '2', 'Not needed', 'Survives a winning commitment; flips back'],
  ]
);
const specialText = text(
  'patching',
  'When Ix wins, an uncommitted Suboid may die in place of a committed Cyborg. Flip the saved Cyborg to its patched side. A patched Cyborg can be dialed in a later winning battle without dying, then flips back. These rules do not save troops from an ordinary defeat.',
  'Cyborg losses'
);
const hiddenExample = example(
  'prescience-example',
  scenes.prescience.example,
  'Example: choosing cards after Prescience'
);
const revealExample = example(
  'reveal-example',
  scenes.reveal.example + ' ' + scenes.weapons.example,
  'Example: the plans are revealed'
);
const resultRule = text('result-rule', scenes.total.rule, '6. Determine the winner');
const spiteExample = example('spite-example', scenes.spite.example, "Example: Vladimir's Spite");
const cardRule = text('card-rule', scenes.cards.rule, '8. Settle cards and the leader reward');
const cardExample = example('card-example', scenes.cards.example, 'Example: cards and reward');
const lossExample = example('loss-example', scenes.losses.example, 'Example: troop losses');
const tieRules = text(
  'tie-rules',
  'The aggressor wins an ordinary tie. Mercenaries adds 1 strength and wins ties. If both sides play Mercenaries and remain tied, the aggressor wins.'
);
const ordinaryTie = example(
  'ordinary-tie',
  'The aggressor totals 7 and the defender totals 7. Neither uses Mercenaries. The aggressor wins.',
  'Example: an ordinary tie'
);
const mercenaryTie = example(
  'mercenary-tie',
  'The aggressor totals 7. The defender has 6 plus 1 from Mercenaries, for 7. The defender wins.',
  'Example: Mercenaries wins the tie'
);

function introduction(): Page {
  return single('battle-introduction', 'Introduction to battles', [
    text(
      'battle-purpose',
      'Battles decide which faction can remain in a contested territory. Use them to take strongholds and prevent other players from winning. A player with troops in three strongholds is contesting a win. If the other players do not prevent it, that player wins in the Mentat phase.\n\nBattles also affect the spice economy. You can deny opponents spice collection, or attack to earn a spice bounty for killing an opposing leader and winning the battle. That bounty can make an attack cost-efficient. Even a defeat can serve your interests if securing victory costs your opponent valuable spice, troops or cards.',
      'What battles are for'
    ),
    text(
      'battle-victory',
      'There can be only one victor in a battle; the two sides cannot share a victory. In an ordinary battle, the defeated faction loses all its troops in the territory. The victor also pays its battle costs and takes losses, so winning does not guarantee that it will have troops left to hold the territory.',
      'What winning means'
    ),
    table(
      'battle-glossary',
      ['Part of a battle', 'What it means'],
      [
        ['Battle plan', 'The choices you prepare for the battle and reveal to your opponent.'],
        ['Troop dial', 'The strength committed by your troops. Spice can support troops to make them count more.'],
        ['Leader', 'A character whose strength can add to your total. A Cheap Hero fills this role with 0 strength.'],
        ['Weapons and defenses', 'Cards that threaten your opponent or protect your own leader.'],
        ['Faction advantages', 'Abilities that affect the choices, information or outcome, at specified times.'],
        ['Resolution and settlement', 'Determine the victor, then settle cards, rewards, payments and losses.'],
      ]
    ),
    text(
      'chapter-route',
      'The following pages explain when battles happen, then troops and leaders in turn. The example between Atreides and Harkonnen brings these parts together: prepare plans, use advantages, reveal, determine the victor and settle the battle.'
    ),
  ]);
}

function troopStrength(): Page {
  return single('dial', 'Dial troop strength', [
    text(
      'dial-meaning',
      'The number on the battle wheel is the strength your troops contribute, not a count of troop tokens. Add the strength of the troops you choose to commit.',
      'What you are dialing'
    ),
    text(
      'ordinary-support',
      'Each ordinary troop contributes ½ strength without spice, or 1 strength when supported with 1 spice. An uncommitted troop contributes 0.',
      'Supported and unsupported troops'
    ),
    text(
      'dial-budget',
      'Use only troops in the battle territory and spice you can commit to this battle. Each troop contributes once. You may leave some troops uncommitted; you do not have to dial the highest strength you can afford.',
      'Choose your commitment'
    ),
    example(
      'dial-example',
      'Atreides has six ordinary troops and chooses to spend 2 spice. It supports two troops and commits two more without support. Two troops remain uncommitted.',
      'Example: six troops, a dial of 3'
    ),
    dialTable,
    text(
      'set-the-wheel',
      'The total is 2 + 1 = 3, so set the wheel to 3 and set aside 2 spice. For a half point, align the mark between whole numbers with the window.',
      'Set the wheel'
    ),
  ]);
}

function leaders(): Page {
  return columns(
    'leaders',
    'Leaders',
    [
      text(
        'leader-strength',
        'A leader adds the strength printed on its token to your troop dial if it survives the battle. Its strength is separate from the number on your battle wheel. Weapons and defenses determine whether the leader survives; the reveal example shows how.',
        'What a leader contributes'
      ),
      text(
        'leader-required',
        'Your battle plan must include a leader or Cheap Hero if you are able to play one. A Cheap Hero has 0 strength, but still lets you play Treachery Cards.',
        'Choose a leader'
      ),
      text(
        'no-leader',
        'If you have no leader or Cheap Hero available, you must announce this publicly prior to reveal. When you play neither, you cannot include any Treachery Cards in your battle plan.',
        'When none is available'
      ),
      text(
        'leader-availability',
        'Use a leader that is available for this territory. The settlement section explains how fighting in one territory commits a leader for the rest of the phase.'
      ),
    ],
    [
      {
        id: 'example-leaders',
        kind: 'illustrated-inventory',
        introduction: '',
        items: [
          { id: 'gurney', source: revealed.left.leader, text: 'Gurney Halleck has 4 strength.' },
          { id: 'feyd', source: revealed.right.leader, text: 'Feyd Rautha has 6 strength.' },
        ],
      },
      example(
        'leader-example',
        'Harkonnen chooses the stronger leader, Feyd. Atreides chooses Gurney. The stronger leader alone does not decide who wins.',
        'The leaders in our example'
      ),
    ]
  );
}

function opening(): Page {
  return single('choose-battle', 'Choose the battle', [
    text(
      'battle-required',
      'Battle occurs when opposing factions have troops in the same territory. Troops separated by the storm cannot fight each other. Follow storm order to decide who chooses the first battle.'
    ),
    board,
    example(
      'map-example',
      'Atreides chooses Hagga Basin first, then Carthag. This chapter follows the battle in Hagga Basin.',
      'Example: two shared territories'
    ),
  ]);
}
function ties(): Page {
  return band('ties', 'How to resolve ties?', [tieRules], [ordinaryTie], [mercenaryTie]);
}
function specials(): Page {
  return single('special-troops', 'Special troops', [
    text(
      'special-intro',
      'Apply these exceptions after learning the ordinary battle. A troop worth 2 strength is still one troop token. Karama can suppress Fedaykin or Free Spice Dialing for the whole phase.'
    ),
    specialTable,
    specialText,
  ]);
}
function traitors(): Page {
  return single('traitors', 'Traitors', [
    text(
      'traitor-timing',
      'Call traitors after both battle plans are revealed, before resolving weapons or comparing strength. A successful call replaces the ordinary battle result.',
      'When to call a traitor'
    ),
    text(
      'traitor-call',
      "If the opposing leader matches your traitor, you may reveal the card and call treachery. A faction may always call its own leader traitor when an opponent uses that leader against it. Harkonnen may call traitor in its ally's battle.",
      'Who can call'
    ),
    text(
      'traitor-victory',
      "With one successful call, the caller wins without losing troops or committed spice. The opposing leader dies, its owner loses all troops in the territory and discards its played cards. The caller receives the traitorous leader's strength in spice. The winner keeps its played cards and may not discard them. Its leader is not committed by this battle.",
      'One successful call'
    ),
    text(
      'mutual-traitors',
      'If both sides successfully call traitor, both sides lose their troops, played cards and leaders. Neither side receives spice.',
      'Two successful calls'
    ),
  ]);
}
function exceptions(): Page {
  return columns(
    'other-outcomes',
    'Other battle outcomes',
    data.special.BSPC.slice(1, 2) as Block[],
    [
      ...data.special.BSPC.slice(2),
      {
        id: 'before-reveal-timing',
        kind: 'callout',
        variant: 'note',
        title: 'What does "prior to reveal" mean?',
        text: 'Make the announcement early enough for your opponent to hear it and have a reasonable opportunity to react, including changing any part of their plan that is not already locked. If you have no available leader or Cheap Hero, say so publicly and allow that opportunity before revealing. An announcement made as the plans are revealed is too late.',
      },
    ] as Block[]
  );
}

const leaderCommitment = text(
  'leader-commitment',
  'Leaders used in battle remain committed to that territory for the rest of the Battle phase. A surviving leader may fight again there, but cannot fight in another territory. A killed leader sent to the Tleilaxu Tanks remains committed to that territory even if revived during the same phase.',
  'Leaders stay committed to the territory'
);
const continueBattle = text(
  'continue-battle',
  'The aggressor finishes all of its battles before the next eligible player chooses.',
  'Continue the Battle phase'
);
function preparingPlans(): Page {
  const plans = (block: typeof preparing): Block => ({
    id: block.id,
    kind: 'battle-plans',
    left: block.left,
    right: block.right,
    showSideLabels: false,
  });
  return {
    id: 'prepare',
    anchor: 'prepare',
    title: 'Build your plans',
    showHeading: true,
    headingIcon: '/vector/icon/combat.svg',
    layoutId: 'paired-rows',
    controlValues: {},
    regions: [
      {
        key: 'opening',
        blocks: [
          text(
            'visual-orientation',
            'Throughout these illustrations, the aggressor is on the left and the defender on the right. Here, that is Atreides and Harkonnen.'
          ),
        ],
      },
      {
        key: 'upperLeft',
        blocks: [
          {
            id: 'preparation-rules',
            kind: 'list',
            style: 'numbered',
            items: [
              {
                id: 'supplies',
                name: 'Resolve preparation effects',
                text: 'Resolve Supplies and the last opportunity for an Ixian alliance card exchange before building plans.',
              },
              { id: 'plan', name: 'Prepare a battle plan', text: scenes.hidden.rule },
            ],
          },
        ],
      },
      { key: 'upperRight', blocks: [plans(preparing)] },
      {
        key: 'lowerLeft',
        blocks: [
          {
            id: 'pre-reveal-rules',
            kind: 'list',
            style: 'numbered',
            start: 3,
            items: [{ id: 'advantages', name: 'Resolve pre-reveal advantages', text: scenes.prescience.rule }],
          },
          hiddenExample,
        ],
      },
      { key: 'lowerRight', blocks: [plans(beforeReveal)] },
      {
        key: 'closing',
        blocks: [
          {
            id: 'finalize-plan',
            kind: 'list',
            style: 'numbered',
            start: 4,
            items: [
              {
                id: 'finalize',
                name: 'Finalize your plan',
                text: 'After pre-reveal advantages are resolved, finalize your cards, dial your chosen troop strength and set aside the matching support spice.',
              },
            ],
          },
        ],
      },
    ],
  };
}
const pages = [
  introduction(),
  opening(),
  troopStrength(),
  leaders(),
  preparingPlans(),
  single('reveal', 'Reveal and resolve', [revealed, revealExample, resultRule, resultTable]),
  {
    ...columns(
      'cards',
      'Settle the battle',
      [
        {
          id: 'cards-heading',
          kind: 'section-heading',
          title: 'Settle abilities and cards',
          faction: { status: 'unselected' },
        },
        spite,
        spiteExample,
        cardRule,
        cardExample,
      ],
      [
        {
          id: 'losses-heading',
          kind: 'section-heading',
          title: 'Pay and remove troops',
          faction: { status: 'unselected' },
        },
        losses,
        lossExample,
        leaderCommitment,
        continueBattle,
      ]
    ),
    showHeading: false,
  },
  ties(),
  traitors(),
  specials(),
  exceptions(),
];
const chapter: RulebookRenderPreviewDocumentV1 = rulebookRenderDocumentV1Schema.parse({
  schemaVersion: 1,
  settings: { size: 'square', design: 'illustrated' },
  pageOrder: pages.map((page) => page.id),
  pagesById: Object.fromEntries(pages.map((page) => [page.id, page])),
});

export function CombatPrototype({ page = 0 }: { page?: number }) {
  const pageId = page > 0 ? chapter.pageOrder[page - 1] : undefined;
  const document = pageId
    ? { ...chapter, pageOrder: [pageId], pagesById: { [pageId]: chapter.pagesById[pageId]! } }
    : chapter;
  return <RulebookDocumentRenderer document={document} pageOffset={pageId ? page - 1 : 0} />;
}
