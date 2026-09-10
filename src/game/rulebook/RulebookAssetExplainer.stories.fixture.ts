import { componentGeometrySchema } from '@shared/asset-publishing/componentGeometry';
import { resolveRulebookBoardDefinition } from '@shared/rulebooks/boardDefinitions';
import type { RulebookRenderBlockV1, RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';
import type { RulebookSourceReference } from '@shared/rulebooks/sources';

import leaderGeometry from './fixtures/asset-explainer/leader-geometry.json';
import leaderImage from './fixtures/asset-explainer/leader.jpg?url';

type Explainer = Extract<RulebookRenderBlockV1, { kind: 'asset-explainer' }>;
const leaderReference = {
  kind: 'faction-member',
  factionId: 'kn75hyvn856e1xdvsfrths1cax8e3k7y',
  memberId: 'de3a4724-4eb8-4e29-bfa9-e2b5d3936534',
} satisfies RulebookSourceReference;

/** The complete Leader image and measured geometry were captured together in the isolated publication proof. */
export function leaderExplainerFixture(): Explainer {
  return {
    id: 'EXPL',
    kind: 'asset-explainer',
    anchor: 'leader-anatomy',
    caption: '',
    numbering: 'automatic',
    colorMode: 'automatic',
    source: {
      status: 'ready',
      reference: leaderReference,
      name: 'Dr. Yueh',
      imageUrl: leaderImage,
      width: 600,
      height: 600,
      geometry: componentGeometrySchema.parse(leaderGeometry),
    },
    items: [
      {
        id: 'PORT',
        label: 'P',
        color: '#ffffff',
        target: { kind: 'named', key: 'portrait', source: leaderReference },
        text: 'The portrait helps identify the Leader at the table.',
      },
      {
        id: 'STRN',
        label: 'S',
        color: '#244d7c',
        target: { kind: 'named', key: 'strength', source: leaderReference },
        text: 'Add this value to the forces committed in your battle plan.',
      },
      {
        id: 'EMBL',
        label: 'E',
        color: '#265e3a',
        target: { kind: 'named', key: 'faction-emblem', source: leaderReference },
        text: 'The emblem identifies the faction this Leader belongs to.',
      },
      {
        id: 'NAME',
        label: 'N',
        color: '#663182',
        target: { kind: 'named', key: 'name', source: leaderReference },
        text: 'Match the printed name with the corresponding Traitor Card.',
      },
    ],
  };
}

export function boardExplainerFixture(): Explainer {
  const board = resolveRulebookBoardDefinition('arrakis')!;
  const source = { kind: 'board', boardId: board.id } satisfies RulebookSourceReference;
  return {
    id: 'BRDX',
    kind: 'asset-explainer',
    anchor: 'strongholds-guide',
    caption: 'The surrounding territories stay visible for context.',
    numbering: 'automatic',
    colorMode: 'automatic',
    source: {
      status: 'ready',
      reference: source,
      name: board.name,
      imageUrl: board.imageUrl,
      geometry: board.geometry,
      publicationRevision: board.revision,
    },
    items: [
      {
        id: 'ARRA',
        label: 'A',
        target: { kind: 'named', key: 'arrakeen', source },
        text: 'Home of House Atreides. Forces here provide access to ornithopters and collect 2 spice during collection.',
      },
      {
        id: 'CART',
        label: 'C',
        target: { kind: 'named', key: 'carthag', source },
        text: 'Home of House Harkonnen. Forces here provide access to ornithopters and collect 2 spice during collection.',
      },
      {
        id: 'TABR',
        label: 'T',
        target: { kind: 'named', key: 'tabr', source },
        text: 'Home of the Fremen, on the western edge of the northern basin.',
      },
      {
        id: 'HABB',
        label: 'H',
        target: { kind: 'named', key: 'habbanya', source },
        text: 'An isolated stronghold, difficult to reach from the northern cities.',
      },
      {
        id: 'TUEK',
        label: 'G',
        target: { kind: 'named', key: 'tueks', source },
        text: 'Home of the Spacing Guild. Forces here collect 1 spice during collection.',
      },
      {
        id: 'SHLD',
        label: 'S',
        target: { kind: 'named', key: 'shield-wall', source },
        text: 'In Dreamrules, this becomes a stronghold for victory after the fourth Shai-Hulud card.',
      },
    ],
  };
}

export function incompleteExplainerFixture(): Explainer {
  const block = leaderExplainerFixture();
  if (block.source.status !== 'ready') {
    throw new Error('Expected the Leader fixture');
  }
  return {
    ...block,
    source: {
      ...block.source,
      geometry: {
        ...block.source.geometry!,
        parts: block.source.geometry!.parts.filter(({ key }) => key !== 'strength'),
      },
    },
    items: [
      ...block.items.slice(0, 2),
      {
        id: 'MARK',
        label: '!',
        color: '#f8dc24',
        target: { kind: 'position', x: 0.7, y: 0.7, source: leaderReference },
        text: 'A positioned marker stays at its saved coordinates when the artwork changes.',
      },
      {
        id: 'LOST',
        label: 'X',
        target: {
          kind: 'named',
          key: 'name',
          source: { ...leaderReference, memberId: '00000000-0000-4000-8000-000000000001' },
        },
        text: 'This explanation keeps its identity when another Leader is chosen.',
      },
    ],
    numbering: 'custom',
    colorMode: 'manual',
  };
}

export function explainerPage(block: Explainer): RulebookRenderPageV1 {
  const board = block.source.status === 'ready' && block.source.reference.kind === 'board';
  return {
    id: 'EXPG',
    anchor: 'explainer-guide',
    title: board ? 'Strongholds' : 'Reading a Leader token',
    layoutId: 'single-column',
    showHeading: false,
    controlValues: {},
    regions: [
      {
        key: 'content',
        blocks: [
          {
            id: 'HEAD',
            kind: 'section-heading',
            title: board ? 'Strongholds' : 'Reading a Leader token',
            faction: { status: 'unselected' },
          },
          {
            id: 'TEXT',
            kind: 'text',
            text: board
              ? 'Strongholds offer shelter and count towards victory. Match each marker on the board to its explanation.'
              : 'Choose a Leader for your battle plan. These details identify the Leader and their contribution to battle.',
          },
          block,
        ],
      },
    ],
  };
}
