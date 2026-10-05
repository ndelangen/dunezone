import { TroopArtwork } from '@shared/factions/schema';
import { resolveRulebookBoardDefinition } from '@shared/rulebooks/boardDefinitions';
import type { RulebookRenderBlockV1, RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';
import { rulebookRenderDocumentV1Schema } from '@shared/rulebooks/renderDocument';
import { rulebookResolvedSourceSchema } from '@shared/rulebooks/sources';

import { RulebookDocumentRenderer } from './RulebookRenderer';
import troopData from './ShipmentMovementPrototype.stories.fixture.json';

type Block = RulebookRenderBlockV1;
type Page = RulebookRenderPageV1;
type Board = Extract<Block, { kind: 'board-scene' }>;
type Explainer = Extract<Block, { kind: 'asset-explainer' }>;
type Movement = Extract<Block, { kind: 'piece-transfer' }>;
export type ShipmentOutline = 'turn' | 'actions' | 'atlas' | 'decisions' | 'blocks';
const board = resolveRulebookBoardDefinition('arrakis')!;
const boardSource: Board['board'] = {
  status: 'ready',
  reference: { kind: 'board', boardId: board.id },
  name: board.name,
  imageUrl: board.imageUrl,
  geometry: board.geometry,
  publicationRevision: board.revision,
};
const faction = troopData.faction as Board['troops'][number]['faction'];
const artwork = TroopArtwork.parse(troopData.artwork);
const color = '#387968';
const icon = '/vector/icon/shipment_disc.svg';

/* These story-only compositions exercise existing saved-page contracts without a replacement renderer. */
const text = (id: string, copy: string, name?: string): Block => ({ id, kind: 'text', text: copy, name });
const example = (id: string, title: string, copy: string): Block => ({
  id,
  kind: 'callout',
  variant: 'example',
  title,
  text: copy,
});
const note = (id: string, title: string, copy: string): Block => ({
  id,
  kind: 'callout',
  variant: 'note',
  title,
  text: copy,
});
const heading = (id: string, title: string): Block => ({
  id,
  kind: 'section-heading',
  title,
  faction: { status: 'unselected' },
});
function list(id: string, items: [string, string][], numbered = false): Block {
  return {
    id,
    kind: 'list',
    style: numbered ? 'numbered' : 'bulleted',
    items: items.map(([name, copy], i) => ({ id: `${id}-${i}`, name, text: copy })),
  };
}
function table(id: string, labels: string[], values: string[][]): Block {
  const columns = labels.map((label, i) => ({ id: `column-${i}`, label }));
  return {
    id,
    kind: 'reference-table',
    columns,
    rows: values.map((row, i) => ({
      id: `${i}`,
      cells: row.map((copy, j) => ({ columnId: `column-${j}`, text: copy })),
    })),
    note: '',
  };
}
const base = (id: string, title: string) => ({ id, anchor: id, title, showHeading: true, headingIcon: icon });
function single(id: string, title: string, blocks: Block[]): Page {
  return { ...base(id, title), layoutId: 'single-column', controlValues: {}, regions: [{ key: 'content', blocks }] };
}
function columns(
  id: string,
  title: string,
  left: Block[],
  right: Block[],
  band: Block[] = []
): Extract<Page, { layoutId: 'band-columns' }> {
  return {
    ...base(id, title),
    layoutId: 'band-columns',
    controlValues: { bandPosition: 'top' },
    regions: [
      { key: 'band', blocks: band },
      { key: 'column1', blocks: left },
      { key: 'column2', blocks: right },
    ],
  };
}
function wide(id: string, title: string, map: Block[], rules: Block[]): Page {
  return {
    ...base(id, title),
    layoutId: 'wide-narrow',
    controlValues: { widePosition: 'right' },
    regions: [
      { key: 'wide', blocks: map },
      { key: 'narrow', blocks: rules },
    ],
  };
}
function marks(id: string, items: [string, string][]): Explainer {
  return {
    id,
    kind: 'asset-explainer',
    source: boardSource,
    caption: '',
    numbering: 'automatic',
    colorMode: 'automatic',
    items: items.map(([key, copy], i) => ({
      id: `${id}-${i}`,
      label: String(i + 1),
      target: { kind: 'named', key, source: { kind: 'board', boardId: board.id } },
      text: copy,
    })),
  };
}
function scene(id: string, positions: [number, number, number][], highlights: string[] = [], storm?: number): Board {
  return {
    id,
    kind: 'board-scene',
    boardId: board.id,
    board: boardSource,
    size: 'fit-width',
    caption: '',
    players: [],
    annotations: [],
    ...(storm !== undefined ? { storm: { angle: storm } } : {}),
    highlights: highlights.map((territory) => ({ territory, color, opacity: 0.3 })),
    troops: positions.map(([x, y, count], i) => ({
      id: `${id}-${i}`,
      faction,
      artwork,
      troopId: troopData.troopId,
      face: 'front',
      count,
      columns: 2,
      x,
      y,
      size: 0.025,
      gap: 0.002,
    })),
  };
}
function transfer(id: string, from: string, to: string, count = 3): Movement {
  const pieces: Movement['left']['pieces'] = [
    {
      id: 'troops',
      kind: 'troops',
      faction,
      artwork,
      troopId: troopData.troopId,
      face: 'front',
      count,
    },
  ];
  return {
    id,
    kind: 'piece-transfer',
    direction: 'right',
    left: { label: from, pieces },
    right: { label: to, pieces },
  };
}
function hajr(): Block {
  return {
    id: 'hajr',
    kind: 'card-entry',
    size: 'small',
    source: rulebookResolvedSourceSchema.parse(troopData.hajr),
    text: 'Play Hajr during your own shipment-and-movement turn to make an additional on-planet movement. Follow the normal movement restrictions. This is not another shipment, and it does not disqualify you from Zensunni Path.',
  };
}
function openingBoard(): Board {
  return {
    ...scene('starting-board', [[0.855, 0.7, 3]], ['tueks', 'arrakeen', 'imperial-basin']),
    annotations: [
      {
        id: 'start',
        title: "Troops in Tuek's Sietch",
        text: 'Three Atreides troops begin here.',
        x: 0.98,
        y: 0.77,
        targetX: 0.86,
        targetY: 0.71,
        color,
      },
      {
        id: 'city',
        title: 'Empty Arrakeen',
        text: 'Ship one troop here to gain ornithopters.',
        x: 0.77,
        y: 0.1,
        targetX: 0.65,
        targetY: 0.14,
        color: '#98632a',
      },
      {
        id: 'destination',
        title: 'Imperial Basin',
        text: 'The southern group will move here after shipment.',
        x: 0.38,
        y: 0.39,
        targetX: 0.55,
        targetY: 0.37,
        color: '#406b8a',
      },
    ],
  };
}
const rules = {
  purpose:
    'Shipment and movement put troops where they can collect spice, threaten a stronghold or prevent another faction from winning. Moving into an enemy territory sets up a battle; it does not resolve one yet.',
  sequence:
    'In storm order, each player may make one shipment and then one on-planet movement. Finish both before the next player acts. You may do either, both or neither.',
  shipment:
    'Choose any number of troops in your reserves and ship them to one legal territory. Choose their sector when placing them. Ordinary shipment does not follow a route across the board.',
  cost: 'Pay 1 spice per troop to a stronghold and 2 spice per troop elsewhere. Pay the Spacing Guild when its Shipping Payments advantage applies; otherwise pay the Spice Bank.',
  movement:
    'Move some or all of your troops from one territory to one other territory. The ordinary range is one adjacent territory; Fremen may move two. On-planet movement costs no spice.',
  ornithopters:
    'If you have troops in Arrakeen or Carthag when your movement begins, you may move up to three territories. The moving group can start anywhere. Shipping into either city can give you ornithopters for the movement that follows.',
  sectors:
    'Count territories entered, not sector lines crossed. Troops in different sectors of the same territory may move together if the storm does not separate them. Moving troops to another sector within the same territory uses your movement.',
  storm:
    'Ordinary troops cannot ship into, enter, leave or pass through a sector covered by the storm. A partly covered territory is still usable through its clear sectors, as long as the route never crosses the storm.',
  occupancy:
    'A stronghold occupied by two other factions is closed to you: you may neither ship into it nor move into or through it. Bene Gesserit advisors do not count towards this limit.',
  ally: 'You may ship into a territory occupied by your ally, but must immediately move your troops out in that same shipment-and-movement action. You cannot wait for a later action or end your turn coexisting there. The Polar Sink and explicit abilities are exceptions.',
  wall: 'Shield Wall remains rock for shipment and occupancy, even after it counts as a stronghold for victory. Shipping there still costs 2 spice per troop, and the two-faction stronghold limit does not apply.',
};
const routeItems: [string, string][] = [
  ['tueks', "Start: three Atreides troops in Tuek's Sietch."],
  ['pasty-mesa', 'First territory entered: Pasty Mesa.'],
  ['shield-wall', 'Second: Shield Wall.'],
  ['imperial-basin', 'Third: Imperial Basin. Stop here.'],
  ['arrakeen', 'A separate Atreides troop in Arrakeen supplies ornithopters.'],
];
function routeMap(id: string): Explainer {
  const block = marks(id, routeItems);
  const labels = ['0', '1', '2', '3', 'A'];
  return {
    ...block,
    numbering: 'custom',
    items: block.items.map((item, index) => ({ ...item, label: labels[index]! })),
  };
}
/* The highlighted zone follows the maintained board boundaries, counted from the Great Flat. */
function deployment(): Page {
  const one = ['plastic-basin', 'funeral-plain', 'wind-pass', 'the-greater-flat'];
  const two = [
    'bight-of-the-cliff',
    'broken-land',
    'cielago-west',
    'false-wall-west',
    'habbanya-erg',
    'hagga-basin',
    'polar',
    'rock-outcroppings',
    'tabr',
    'tsimpo',
    'wind-pass-north',
  ];
  const deploymentMap: Board = {
    ...scene('deployment-zone', []),
    highlights: [
      { territory: 'the-great-flat', color: '#9b3d27', opacity: 0.7 },
      ...one.map((territory) => ({ territory, color: '#377a69', opacity: 0.55 })),
      ...two.map((territory) => ({ territory, color: '#5c6ba6', opacity: 0.45 })),
    ],
    annotations: [
      {
        id: 'origin',
        title: 'The Great Flat',
        text: 'Deploy here, or count outwards from here. The Great Flat itself is not the first step.',
        x: 0.03,
        y: 0.47,
        targetX: 0.2,
        targetY: 0.46,
        color: '#9b3d27',
      },
      {
        id: 'one',
        title: 'One territory away',
        text: 'Funeral Plain, Plastic Basin, Wind Pass and the Greater Flat.',
        x: 0.3,
        y: 0.66,
        targetX: 0.39,
        targetY: 0.5,
        color: '#377a69',
      },
      {
        id: 'two',
        title: 'Two territories away',
        text: 'Bight of the Cliff, Sietch Tabr, Rock Outcroppings, Broken Land, Tsimpo, Hagga Basin, Polar Sink, Wind Pass North, Cielago West, False Wall West and Habbanya Erg.',
        x: 0.05,
        y: 0.26,
        targetX: 0.15,
        targetY: 0.27,
        color: '#5c6ba6',
      },
    ],
  };
  return single('deployment', 'Fremen deployment zone', [
    text(
      'deployment-rule',
      'Fremen deploy reserves for free onto the Great Flat or one territory within two steps of it. Choose one destination in the coloured zone. This replaces ordinary shipment; other destinations require an ability.'
    ),
    deploymentMap,
    example(
      'deployment-example',
      'Deployment is separate from movement',
      'Deploy to Sietch Tabr, then make your separate movement: up to two territories, or three with ornithopters.'
    ),
  ]);
}
function timing(): Page {
  return columns(
    'timing',
    'Who acts when?',
    [
      heading('guild-heading', 'Guild interjection'),
      text(
        'guild-once',
        'Once during the phase, the Spacing Guild may change turn order in one of three ways. Its shipment and movement still form one turn.'
      ),
      list('guild-order', [
        [
          'Choose when to act',
          'Go first, last or between two other factions. The other players continue in storm order.',
        ],
        [
          'Swap positions',
          'Exchange your position with another faction before your normal place in the order has passed.',
        ],
        [
          'Make another player act now',
          'Force a player to take their turn now and take their place in the order. Use this before your normal place has passed.',
        ],
      ]),
      example(
        'guild-example',
        'Change the information available',
        'The Guild can wait to see where opponents commit, or make an opponent act early before other players reveal their destinations.'
      ),
    ],
    [
      heading('delay-heading', 'Fremen delayed movement'),
      text(
        'delay-rule',
        'With Zensunni Path, Fremen may allow one faction, including themselves, that did not make its ordinary on-planet movement to move at the end of the phase. Wait until everyone, including the Guild, has finished.'
      ),
      text(
        'delay-choice',
        'That faction may already have shipped. Passing movement keeps it eligible; making an ordinary movement does not. A Hajr move does not disqualify it.'
      ),
      example(
        'delay-example',
        'Ship now, move later',
        'Fremen rally troops on their turn and pass their ordinary movement. After the last player, they use Zensunni Path on themselves and move with knowledge of the final board position.'
      ),
      hajr(),
    ]
  );
}
function exceptions(): Page {
  return columns(
    'exceptions',
    'Check your faction',
    [
      heading('guild-heading', 'Spacing Guild'),
      text(
        'guild-shipping',
        'Pay half the ordinary shipment cost, rounding the total up. You may ship reserves to a territory, territory to territory at the destination rate, or territory to reserves at the stronghold rate.'
      ),
      heading('fremen-heading', 'Fremen'),
      text(
        'fremen-rules',
        'Your troops may enter, leave and cross the storm. Use the deployment-zone map for Rallying Shipment and the timing page for Zensunni Path.'
      ),
    ],
    [
      heading('bg-heading', 'Bene Gesserit'),
      text(
        'bg-rules',
        'Before the first shipment, choose which advisor groups become fighters; advisors alone in a territory become fighters automatically. Advisors do not block strongholds or grant ornithopters.'
      ),
      text(
        'bg-accompany',
        'When another faction ships from off planet, you may place an advisor at its destination if you have no fighters there, or a fighter in the Polar Sink. Troops joining your existing group adopt its posture.'
      ),
      heading('ix-heading', 'Ixians and Bene Tleilax'),
      text(
        'ix-rules',
        'Cyborgs may move two territories; Suboids may accompany them. Ship to your Hidden Mobile Surveyor at the stronghold rate. Entering or leaving it is movement between territories.'
      ),
      text(
        'bt-rules',
        'Bene Tleilax may kill troops in reserves to fund shipment, each providing 1 spice through Synthetic Spice.'
      ),
    ]
  );
}
function turn(): Page[] {
  return [
    single('turn-start', 'Shipment and movement', [
      text(
        'turn-sequence',
        'In storm order, finish your shipment, then your movement, before the next player acts. You may do either, both or neither.'
      ),
      openingBoard(),
      example(
        'starting-example',
        'One turn, two useful actions',
        'Atreides uses shipment to unlock a longer movement elsewhere. Follow this turn over the next two pages.'
      ),
    ]),
    columns(
      'turn-ship',
      'First, ship to Arrakeen',
      [
        text('ship', rules.shipment, 'Bring troops from reserves'),
        text(
          'cities',
          'Arrakeen and Carthag are the most important territories on the map for mobility: either gives your troops elsewhere access to ornithopters.'
        ),
        text('prices', rules.cost, 'Pay for the destination'),
        table(
          'costs',
          ['Destination', '3 ordinary troops'],
          [
            ['Stronghold', '3 spice'],
            ['Other territory', '6 spice'],
          ]
        ),
        example(
          'ship-example',
          'Spend 1 spice',
          'Atreides ships one troop from reserves to empty Arrakeen. That troop stays there while a different group makes the next move.'
        ),
      ],
      [
        transfer('one-arrives', 'Reserves', 'Arrakeen', 1),
        scene(
          'after-ship',
          [
            [0.65, 0.14, 1],
            [0.855, 0.7, 3],
          ],
          ['arrakeen']
        ),
      ]
    ),
    wide(
      'turn-move',
      'Then, use ornithopters',
      [
        {
          ...scene('ornithopter-route', [[0.65, 0.14, 1]]),
          highlights: ['tueks', 'pasty-mesa', 'shield-wall', 'imperial-basin'].map((territory) => ({
            territory,
            color: '#215f89',
            opacity: 0.2,
          })),
          routes: [
            {
              id: 'flight',
              label: '0 to 3: one movement',
              direction: 'forward',
              waypoints: ['tueks', 'pasty-mesa', 'shield-wall', 'imperial-basin'].map((territory) => ({ territory })),
            },
          ],
        },
        example(
          'route-example',
          'Three territories, one movement',
          "The group leaves Tuek's Sietch (0), crosses Pasty Mesa (1) and Shield Wall (2), then stops in Imperial Basin (3). The troop in Arrakeen stays put."
        ),
      ],
      [
        text('ordinary-move', rules.movement, 'Choose one group'),
        text('ornithopters', rules.ornithopters, 'Extend its range'),
        text(
          'counting',
          'Count each territory entered. Your starting territory is 0. Sector lines do not add steps.',
          'Count the route'
        ),
      ]
    ),
    columns(
      'turn-check',
      'Check the whole route',
      [
        list(
          'checks',
          [
            ['Range', rules.movement],
            ['Sectors', rules.sectors],
            ['Storm', rules.storm],
          ],
          true
        ),
      ],
      [
        list(
          'destination-checks',
          [
            ['Other factions', rules.occupancy],
            ['Your ally', rules.ally],
            ['Shield Wall', rules.wall],
          ],
          true
        ),
        note(
          'later-battle',
          'Movement ends before battle',
          'Opposing troops do not stop you crossing an ordinary territory. If opposing factions end the phase together in a territory where they can fight, resolve that contest in the Battle Phase.'
        ),
      ]
    ),
    deployment(),
    timing(),
    exceptions(),
  ];
}
function actions(): Page[] {
  return [
    {
      ...columns(
        'actions-overview',
        'Shipment and movement',
        [
          heading('ship-heading', '1. Shipment'),
          text(
            'ship-rule',
            'Bring any number of troops from reserves to one legal territory and choose their sector. Pay 1 spice per troop to a stronghold, or 2 elsewhere. Pay the Spacing Guild if its Shipping Payments advantage applies; otherwise pay the Spice Bank.'
          ),
          {
            ...scene(
              'ship-carthag',
              [
                [0.07, 0.04, 3],
                [0.455, 0.17, 3],
              ],
              ['carthag']
            ),
            routes: [
              {
                id: 'shipment',
                label: 'Reserves to Carthag: 3 troops, 3 spice',
                direction: 'forward',
                showWaypoints: false,
                color: '#387968',
                waypoints: [{ position: { x: 0.15, y: 0.065 } }, { territory: 'carthag' }],
              },
            ],
          },
        ],
        [
          heading('move-heading', '2. On-planet movement'),
          text(
            'move-rule',
            'Move some or all troops from one territory to another for free: one territory, or two as Fremen. Having troops in Carthag or Arrakeen when movement begins increases this to three, even if they just shipped there and all now leave.'
          ),
          {
            ...scene('carthag-cielago', [[0.51, 0.69, 3]], ['carthag', 'imperial-basin', 'polar', 'cielago-north']),
            routes: [
              {
                id: 'movement',
                label: 'Carthag to Cielago North: 3 territories',
                direction: 'forward',
                waypoints: [
                  { territory: 'carthag' },
                  { territory: 'imperial-basin', position: { x: 0.55, y: 0.34 } },
                  { territory: 'polar' },
                  { territory: 'cielago-north' },
                ],
              },
            ],
          },
        ],
        [
          text(
            'phase-introduction',
            'Position your troops to collect spice, contest strongholds and prevent rivals from winning. In storm order, each player may make one shipment followed by one on-planet movement. Both are optional. Finish your turn before the next player acts.'
          ),
        ]
      ),
      controlValues: { bandPosition: 'top' },
    },
    columns(
      'actions-limits',
      'Destination or route?',
      [
        heading('destination-heading', 'Check the landing place'),
        list(
          'landing',
          [
            ['Storm', 'Your chosen sector must be clear of the storm.'],
            ['Stronghold', 'It cannot already contain two other factions. Advisors do not count.'],
            ['Ally', rules.ally],
          ],
          true
        ),
        text('wall', rules.wall),

        note(
          'no-flight-route',
          'Shipment has no on-board route',
          'You do not count territories between reserves and the destination.'
        ),
      ],
      [
        heading('route-heading', 'Check every territory passed'),
        text('storm', rules.storm),
        text('occupancy', rules.occupancy),
        text(
          'opponents',
          'Opposing troops otherwise do not block your passage. Choose the destination sector when you finish.'
        ),
        example(
          'blocked',
          'An occupied stronghold',
          'If two other factions occupy Carthag, it cannot be your destination or a shortcut through the map.'
        ),
      ],
      [text('purpose', rules.purpose)]
    ),
    single('actions-range', 'One, two or three territories', [
      table(
        'ranges',
        ['Movement', 'Range'],
        [
          ['Ordinary troops', '1 territory'],
          ['Fremen; Cyborgs with accompanying Suboids', '2 territories'],
          ['Ornithopters from Arrakeen or Carthag', 'Up to 3 territories'],
        ]
      ),
      routeMap('range-map'),
      text('sectors', rules.sectors),
    ]),
    single('actions-cities', 'Why the two cities matter', [
      text('ornithopters', rules.ornithopters),
      marks('cities-map', [
        ['arrakeen', 'Holding Arrakeen unlocks ornithopter movement for troops anywhere on the board.'],
        [
          'carthag',
          'Carthag gives the same access. These are the most important territories for mobility; you need either city, not both.',
        ],
      ]),
      example(
        'allied-city',
        'An allied city is a transit stop',
        'You may ship into allied Arrakeen, but must immediately leave in that same shipment-and-movement action. You cannot finish your action sharing it with your ally.'
      ),
    ]),
    deployment(),
    timing(),
    exceptions(),
  ];
}
function atlas(): Page[] {
  return [
    single('atlas-land', 'Shipment and movement', [
      text('purpose', rules.purpose),
      text('sequence', rules.sequence),
      marks('landing-map', [
        ['arrakeen', 'Stronghold: 1 spice per troop. Troops here grant ornithopters.'],
        [
          'carthag',
          'The same shipment rate and ornithopter access. These two cities are the most important territories for mobility.',
        ],
        ['imperial-basin', 'Sand: 2 spice per troop.'],
        ['shield-wall', 'Rock: 2 spice per troop, even when it counts towards victory.'],
      ]),
      text('ship', rules.shipment),
    ]),
    single('atlas-travel', 'Read a movement route', [
      text('movement', rules.movement),
      routeMap('travel-map'),
      example(
        'travel-example',
        'The moving group can be elsewhere',
        'Troops in Arrakeen or Carthag when movement begins grant up to three territories, even after shipping there. The moving group can be elsewhere.'
      ),
    ]),
    wide(
      'atlas-storm',
      'The storm blocks sectors',
      [
        scene(
          'storm-map',
          [
            [0.65, 0.14, 1],
            [0.855, 0.7, 3],
          ],
          ['pasty-mesa', 'shield-wall', 'imperial-basin'],
          10
        ),
        example(
          'storm-example',
          'Check the actual path',
          'The red wedge cuts across the eastern map. A three-territory range never grants permission to cross it.'
        ),
      ],
      [
        text('storm', rules.storm),
        text(
          'distance',
          'Sector lines are not extra steps. A territory can span several sectors; that does not make it several territories.'
        ),
        note('fremen', 'Fremen exception', 'Fremen may enter, leave and pass through the storm.'),
      ]
    ),
    single('atlas-occupied', 'Read who is already there', [
      marks('occupied-map', [
        [
          'carthag',
          'If two other factions occupy this stronghold, you may not ship into, enter or pass through it. Advisors do not count.',
        ],
        [
          'imperial-basin',
          'Opposing troops in an ordinary territory do not prevent passage. Ending together can set up a battle.',
        ],
        ['shield-wall', 'Victory status does not impose the stronghold occupancy limit here.'],
      ]),
      text('allies', rules.ally),
      note('payment', 'Pay for shipment', rules.cost),
    ]),
    deployment(),
    timing(),
    exceptions(),
  ];
}
function decisions(): Page[] {
  return [
    columns(
      'decisions-goal',
      'Shipment and movement',
      [
        text('purpose', rules.purpose),
        list(
          'aims',
          [
            ['Claim spice', 'Place troops where they can survive until collection.'],
            ['Contest a stronghold', 'Put a rival under pressure or interrupt a winning position.'],
            [
              'Reinforce',
              'Add troops before battle. Arrakeen and Carthag are the most important territories for mobility: either grants ornithopters to groups elsewhere.',
            ],
          ],
          true
        ),
        note(
          'choices',
          'You do not have to do both',
          'Shipment and movement are optional. Passing one does not cost you the other.'
        ),
      ],
      [
        scene('targets', [], ['arrakeen', 'imperial-basin', 'tueks']),
        table(
          'choose-action',
          ['Where are your troops?', 'Start here'],
          [
            ['In reserves', 'Consider shipment'],
            ['On the board', 'Consider movement'],
            ['Both', 'Ship first, then move'],
          ]
        ),
      ],
      [text('sequence', rules.sequence)]
    ),
    columns(
      'decisions-ship',
      'Can you make this shipment?',
      [
        list(
          'ship-questions',
          [
            ['Choose one destination', rules.shipment],
            ['Check the sector', 'Ordinary shipment cannot enter the storm.'],
            ['Check occupation', rules.occupancy],
            ['Check your ally', rules.ally],
          ],
          true
        ),
      ],
      [
        transfer('shipment', 'Reserves', 'Arrakeen'),
        table(
          'budget',
          ['Troops', 'Stronghold', 'Elsewhere'],
          [
            ['1', '1 spice', '2 spice'],
            ['3', '3 spice', '6 spice'],
            ['5', '5 spice', '10 spice'],
          ]
        ),
        text('pay', rules.cost),
        example(
          'budget-example',
          'A budget of 5 spice',
          'At ordinary rates, you can ship five troops to a stronghold or two elsewhere. Three troops elsewhere would cost 6 spice.'
        ),
      ]
    ),
    single('decisions-move', 'How far can this group go?', [
      list(
        'range-questions',
        [
          ['Choose one group', rules.movement],
          ['Check ornithopters', rules.ornithopters],
        ],
        true
      ),
      routeMap('decision-route'),
    ]),
    columns(
      'decisions-final',
      'Is the whole move legal?',
      [
        list(
          'route-checklist',
          [
            ['Storm', rules.storm],
            ['Strongholds', rules.occupancy],
            ['Ally', rules.ally],
            ['One destination', 'Do not split this group between several territories. Choose the destination sector.'],
          ],
          true
        ),
      ],
      [
        heading('after-move', 'After placement'),
        text(
          'battle',
          'Troops that end together with an opposing faction may fight in the Battle Phase. Finish the remaining players before resolving battles.'
        ),
        text('sectors', rules.sectors),
        text('wall', rules.wall),
        example(
          'pass-example',
          'Passing is a choice',
          'If no route achieves your aim, leave the group where it is. Fremen may later grant a Zensunni Path movement to a faction that passed its ordinary move.'
        ),
      ]
    ),
    deployment(),
    timing(),
    exceptions(),
  ];
}
function blockReview(): Page[] {
  return [
    single('block-plan', 'What the layouts reveal', [
      text(
        'scope',
        'Authoring review, not player-facing rules. The four outlines use the square-page renderer and registered rulebook blocks. A now uses the approved route, board-sizing and piece-transfer additions. B, C and D remain alternative outlines.'
      ),
      table(
        'inventory',
        ['Existing block', 'What it already gives us'],
        [
          ['Text, list, example callout', 'Rules, numbered checks and clearly separated examples.'],
          ['Reference table', 'Shipment prices, range comparisons and decision tables.'],
          ['Board scene', 'Full board, storm, troops and territory highlights.'],
          ['Asset explainer', 'Named territory references, highlights and a matching numbered legend.'],
          ['Piece movement', 'Troop groups moving between two named places.'],
          ['Custom explainer labels', 'The route map labels its start 0, entered territories 1 to 3 and the city A.'],
        ]
      ),
      heading('proposal', 'Board scene: route inputs'),
      text(
        'route-api',
        'Keep board, storm, troops, highlights and annotations. An optional routes list supplies the path. Each route has an id, ordered waypoints, a direction and a legend label. Each waypoint identifies a territory or an explicit position, such as reserves beside the board. Position overrides can place a point within a chosen territory. Waypoint numbers can be hidden for shipment arrows. The author supplies the route; the block draws it.'
      ),
      text(
        'route-reason',
        'Numbered highlights identify places; route lines connect them as a travel path. A route makes the order, direction and a blocked segment visible. The same input could explain worm rides, a moving Surveyor or travel in another rulebook.'
      ),
      note(
        'boundary',
        'Keep the block a renderer',
        'It does not calculate legality, range or shipping prices. Those remain supplied rules and examples. Existing scenes without routes keep their original rendering.'
      ),
    ]),
    single('block-options', 'Blocks used by this chapter', [
      table(
        'decisions',
        ['Need found while composing', 'Decision'],
        [
          ['Price calculation', 'Keep the existing reference table. No shipping calculator block.'],
          ['Before / after placement', 'Keep two board scenes in existing columns when comparison earns the space.'],
          [
            'Troops travelling between places',
            'Piece transfer takes left and right groups (labels, piece references, counts) plus direction. It adds no step or explanation; those belong in neighbouring text blocks.',
          ],
          ['Flexible prose beside a map', 'Use band-columns or wide-narrow. No new layout yet.'],
          ['Route with several stops', 'Board scene now accepts optional route data.'],
          [
            'Unannotated map is too small',
            'Board scene accepts compact or fit-width. Existing scenes keep compact sizing; this chapter fills its columns.',
          ],
          [
            'Hajr and faction ability details',
            'Hajr already uses its real card reference. Complete faction-specific diagrams after choosing the chapter structure.',
          ],
        ]
      ),
    ]),
    single('block-inputs', 'Inputs in use', [
      heading('route-example', 'Routes on a board scene'),
      table(
        'route-input',
        ['Input', 'Example value'],
        [
          ['Board', 'Arrakis reference.'],
          ['Waypoints', "Tuek's Sietch > Pasty Mesa > Shield Wall > Imperial Basin."],
          ['Direction', 'Forward, both directions or no arrows.'],
          ['Legend', 'Ornithopter movement: three territories entered.'],
          ['Optional segment emphasis', 'Mark a supplied segment as blocked, with the reason in the legend.'],
        ]
      ),
      heading('board-size-heading', 'Board scene sizing'),
      text(
        'board-size',
        'Size: compact or fit-width. Compact preserves current scenes. Fit-width keeps the complete board at its natural proportions and fills the supplied column. This is a presentation choice, not a separate map block.'
      ),
      heading('clearance-heading', 'Page decoration clearance'),
      text(
        'clearance',
        'Ordinary illustrated layouts now share the same bottom clearance as paired rows, allowing some artwork overlap. The compact sequence layout keeps its existing tighter clearance. No new content block is needed.'
      ),
      text(
        'choice',
        'My preference is A for the teaching sequence, with the large route map from C. B is the strongest quick reference; D is useful at the table but interrupts the first reading with more questions.'
      ),
    ]),
  ];
}
const outlines = { turn, actions, atlas, decisions, blocks: blockReview };
export function ShipmentMovementPrototype({
  outline = 'turn',
  page = 0,
}: {
  outline?: ShipmentOutline;
  page?: number;
}) {
  const pages = outlines[outline]();
  const chapter = rulebookRenderDocumentV1Schema.parse({
    schemaVersion: 1,
    settings: { size: 'square', design: 'illustrated' },
    pageOrder: pages.map(({ id }) => id),
    pagesById: Object.fromEntries(pages.map((value) => [value.id, value])),
  });
  const pageId = page > 0 ? chapter.pageOrder[page - 1] : undefined;
  const document = pageId
    ? { ...chapter, pageOrder: [pageId], pagesById: { [pageId]: chapter.pagesById[pageId]! } }
    : chapter;
  return <RulebookDocumentRenderer document={document} pageOffset={pageId ? page - 1 : 0} />;
}
