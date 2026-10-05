import type {
  RulebookRenderBlockV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from '@shared/rulebooks/renderDocument';
import { rulebookRenderDocumentV1Schema } from '@shared/rulebooks/renderDocument';

import data from './CombatPrototype.stories.fixture.json';
import { deathPanel, presciencePanel, renderedBattleStep } from './RulebookBattlePlan.stories.fixture';
import { RulebookDocumentRenderer } from './RulebookRenderer';

/* These chapter alternatives use the saved rulebook contract and its normal renderer.
 * Storybook varies the page arrangements, never the blocks' rendering or typography.
 */
export type CombatVariant = 'comic' | 'lesson' | 'table';
type Block = RulebookRenderBlockV1;
type Page = RulebookRenderPageV1;
type Scene = 'hidden' | 'prescience' | 'dial' | 'reveal' | 'weapons' | 'total' | 'spite' | 'cards' | 'losses';
const scenes: Record<Scene, { n: number; lead: string; rule: string; example: string }> = {
  hidden: {
    n: 2,
    lead: 'Prepare a battle plan.',
    rule: 'Choose in secret: an available leader or a 0-strength Cheap Hero, up to one weapon and one defense. Either card slot may be empty. Keep both the cards and their number secret until reveal, except for information disclosed by an advantage. A leader used in another territory this phase is unavailable. With neither leader nor Cheap Hero, announce it: you fight without Treachery Cards.',
    example: '',
  },
  prescience: {
    n: 3,
    lead: 'Resolve pre-reveal advantages.',
    rule: "Follow each applicable faction advantage's timing and conditions. The Voice precedes Battle Prescience. Blackmail, Stone Burner, Fanatical Tactics and Infiltration also act before reveal.",
    example:
      'Atreides uses Prescience: "Which weapon will you play?" Harkonnen answers "Gom Jabbar." That answer is binding. Its other cards, if any, remain unknown until reveal.',
  },
  dial: {
    n: 4,
    lead: 'Dial troop strength; set aside support spice.',
    rule: 'An ordinary troop gives \u00bd strength unsupported, or 1 with 1 spice of support. Dial a total your troops and spice can supply, excluding the leader. For a half point, align the mark between whole numbers with the window. Keep the plan hidden.',
    example:
      'Two supported troops plus two unsupported supply 3 strength for 2 spice. The other two Atreides troops contribute nothing.',
  },
  reveal: {
    n: 5,
    lead: 'Reveal both final plans together.',
    rule: 'Finish pre-reveal abilities, then reveal both plans simultaneously. Resolve traitor calls first; a successful call replaces the ordinary result. The illustration shows Atreides at left and Harkonnen at right.',
    example:
      'Neither calls a traitor. Atreides reveals dial 3, 2 spice and Gurney. Harkonnen reveals dial 4, 4 spice and Feyd. Both reveal their weapon and defense.',
  },
  weapons: {
    n: 6,
    lead: 'Resolve both weapons against the opposing defenses.',
    rule: 'An unblocked weapon kills the opposing leader. A killed leader contributes 0 strength; its troops still count. Winning does not itself save your leader.',
    example:
      "Gurney's Snooper stops Gom Jabbar. Feyd's Snooper cannot stop the Maula Pistol, so Feyd dies. The red cross marks his death.",
  },
  total: {
    n: 7,
    lead: 'Add strength and determine the winner.',
    rule: 'Add the troop dial, surviving leader and permitted bonuses. Higher strength wins. The aggressor normally wins ties; Mercenaries can change that. Settle the result before cards and losses.',
    example: "Atreides has 3 + Gurney's 4 = 7. Harkonnen has 4 + 0 = 4. Atreides wins.",
  },
  spite: {
    n: 8,
    lead: 'Resolve post-reveal advantages at their stated time.',
    rule: "Other factions may act after reveal or after the result, sometimes only under specific conditions. Check each ability's window before continuing.",
    example:
      "Feyd died, allowing Vladimir's Spite. After the result, Harkonnen exchanges Gom Jabbar for Atreides' Snooper. The battle remains 7 to 4; neither plan changes.",
  },
  cards: {
    n: 9,
    lead: 'Settle cards and the leader reward.',
    rule: "The ordinary winner may keep or discard played cards; the loser discards them. The winner collects the killed opposing leader's strength in spice. Leaders remain committed to this territory for the phase, even after revival.",
    example:
      'Atreides collects 6 spice and keeps its Pistol and new Gom Jabbar. The received card cannot be discarded immediately. Harkonnen discards both Snoopers.',
  },
  losses: {
    n: 10,
    lead: 'Pay support and remove troops last.',
    rule: 'Both pay committed spice. The winner loses troops matching its dial and payment; the loser loses all troops in the territory. Resolve any Harkonnen capture, then choose the next battle. A surviving leader may fight again here.',
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
function single(id: string, title: string, blocks: Block[]): Page {
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
const beforeReveal = {
  ...renderedBattleStep(presciencePanel, 3),
  title: 'Resolve pre-reveal advantages',
  caption: scenes.prescience.rule,
  dialogue: [],
  showSideLabels: true,
};
const revealed = {
  ...renderedBattleStep(deathPanel, 5),
  step: '5–6',
  title: 'Reveal and resolve weapons',
  caption: scenes.reveal.rule + ' ' + scenes.weapons.rule,
  dialogue: [],
  outcome: undefined,
  showSideLabels: true,
  left: { ...renderedBattleStep(deathPanel, 5).left, result: undefined },
  right: { ...renderedBattleStep(deathPanel, 5).right, result: undefined },
};
revealed.left.troops[0]!.uncommitted = 2;
revealed.right.troops[0]!.uncommitted = 1;
const spite = {
  ...sourceBlocks.SPTE,
  outcome: undefined,
  title: 'Resolve post-reveal advantages',
  caption: scenes.spite.rule,
  notes: [],
} as Block;
const losses = {
  ...sourceBlocks.LSES,
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
  ],
  'The dial is troop strength. Add the surviving leader only after reveal.'
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
const preparation: Block = {
  id: 'preparation',
  kind: 'list',
  style: 'numbered',
  items: [
    {
      id: 'supplies',
      name: 'Resolve preparation effects.',
      text: 'Resolve Supplies and the last opportunity for an Ixian alliance card exchange before building plans.',
    },
    { id: 'plan', name: scenes.hidden.lead, text: scenes.hidden.rule },
  ],
};
const dialRule = text('dial-rule', scenes.dial.rule, '4. Dial troop strength');
const hiddenExample = example('prescience-example', scenes.prescience.example, 'Example: Battle Prescience');
const revealExample = example(
  'reveal-example',
  scenes.reveal.example + ' ' + scenes.weapons.example,
  'Example: the plans are revealed'
);
const resultRule = text('result-rule', scenes.total.rule, '7. Determine the winner');
const spiteExample = example('spite-example', scenes.spite.example, "Example: Vladimir's Spite");
const cardRule = text('card-rule', scenes.cards.rule, '9. Settle cards and the leader reward');
const cardExample = example('card-example', scenes.cards.example, 'Example: cards and reward');
const lossExample = example('loss-example', scenes.losses.example, 'Example: troop losses');
const timing = text(
  'timing',
  'After The Voice and Battle Prescience come Blackmail and Stone Burner. Fanatical Tactics and Infiltration act during commitment. Apply each stated condition and deadline. Emperor and Ixian Fates cannot be used during commitment.',
  'Other faction windows'
);
const tieRules = text(
  'tie-rules',
  'The aggressor wins an ordinary tie. One Mercenaries card may be added without using a weapon, defense or leader slot. It adds 1 strength and wins ties. If both sides play Mercenaries and remain tied, the aggressor wins.'
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
function exceptions(): Page {
  return columns(
    'other-outcomes',
    'Other battle outcomes',
    data.special.BSPC.slice(0, 2) as Block[],
    data.special.BSPC.slice(2) as Block[]
  );
}

const continueBattle = text(
  'leader-commitment',
  'Leaders remain committed to this territory for the phase, even after revival. A surviving leader may fight again here. The aggressor finishes all of its battles before the next eligible player chooses.',
  'Continue the Battle phase'
);
function chapter(variant: CombatVariant): Page[] {
  const pages = [opening()];
  if (variant === 'lesson') {
    pages.push(columns('prepare', 'Build your plans', [preparation, timing], [beforeReveal, hiddenExample]));
    pages.push(
      band('dial', 'Dial troop strength', [dialRule], [dialTable], [example('dial-example', scenes.dial.example)])
    );
    pages.push(single('reveal', 'Reveal and resolve', [revealed, revealExample, resultRule, resultTable]));
    pages.push(columns('cards', 'Settle abilities and cards', [spite, spiteExample], [cardRule, cardExample]));
    pages.push(columns('losses', 'Pay and remove troops', [losses], [lossExample, continueBattle]));
  } else {
    pages.push(single('prepare', 'Build your plans', [preparation, beforeReveal, hiddenExample]));
    pages.push(
      single('dial', 'Dial troop strength', [dialRule, dialTable, example('dial-example', scenes.dial.example), timing])
    );
    pages.push(single('reveal', 'Reveal and resolve', [revealed, revealExample, resultRule, resultTable]));
    if (variant === 'table') {
      pages.push(
        single('settle', 'Settle the battle', [
          table(
            'settlement-order',
            ['Order', 'What to do'],
            [
              ['8. Abilities', scenes.spite.rule],
              ['9. Cards and reward', scenes.cards.rule],
            ]
          ),
          example(
            'settlement-example',
            scenes.spite.example + ' ' + scenes.cards.example,
            'Example: Spite, cards and reward'
          ),
          losses,
          lossExample,
        ])
      );
    } else {
      pages.push(single('cards', 'Settle abilities and cards', [spite, spiteExample, cardRule, cardExample]));
      pages.push(single('losses', 'Pay and remove troops', [losses, lossExample, continueBattle]));
    }
  }
  return [...pages, ties(), specials(), exceptions()];
}

const documents = Object.fromEntries(
  (['comic', 'lesson', 'table'] as const).map((variant) => {
    const pages = chapter(variant);
    const document: RulebookRenderPreviewDocumentV1 = {
      schemaVersion: 1,
      settings: { size: 'square', design: 'illustrated' },
      pageOrder: pages.map((page) => page.id),
      pagesById: Object.fromEntries(pages.map((page) => [page.id, page])),
    };
    return [variant, rulebookRenderDocumentV1Schema.parse(document)];
  })
) as Record<CombatVariant, RulebookRenderPreviewDocumentV1>;

export function CombatPrototype({ variant, page = 0 }: { variant: CombatVariant; page?: number }) {
  const chapter = documents[variant];
  const pageId = page > 0 ? chapter.pageOrder[page - 1] : undefined;
  const document = pageId
    ? { ...chapter, pageOrder: [pageId], pagesById: { [pageId]: chapter.pagesById[pageId]! } }
    : chapter;
  return <RulebookDocumentRenderer document={document} pageOffset={pageId ? page - 1 : 0} />;
}
