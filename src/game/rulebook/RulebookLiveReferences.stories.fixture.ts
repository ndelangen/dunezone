import type { RulebookRenderBlockV1, RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';

type LiveReferenceBlock = Extract<
  RulebookRenderBlockV1,
  { kind: 'referenced-illustration' | 'illustrated-inventory' | 'faction-introduction' }
>;

export function liveReferenceBlocks(): LiveReferenceBlock[] {
  return [
    {
      id: 'DRAW',
      kind: 'referenced-illustration',
      caption: 'Arrakis, with its territories and sectors.',
      source: {
        status: 'ready',
        reference: { kind: 'board', boardId: 'arrakis' },
        name: 'Arrakis board',
        imageUrl: '/page/map.svg',
      },
    },
    {
      id: 'STUF',
      kind: 'illustrated-inventory',
      title: 'Before the game',
      introduction: 'Set these components beside the board.',
      items: [
        {
          id: 'STOR',
          source: {
            status: 'ready',
            reference: { kind: 'stock', artworkId: '/page/storm.svg' },
            name: 'Storm marker',
            imageUrl: '/page/storm.svg',
          },
          quantity: 1,
          text: 'Place the marker on the edge of the board. It marks the current storm sector.',
        },
        {
          id: 'LOST',
          source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'removed-token' } },
          quantity: 0,
          caption: 'An optional component',
          text: 'This explanation remains available when its source is removed.',
        },
      ],
    },
    {
      id: 'FACT',
      kind: 'faction-introduction',
      text: 'The Atreides rely on knowledge to choose their battles. Keep your plans flexible as new information arrives.',
      faction: {
        status: 'ready',
        factionId: 'atreides',
        name: 'Atreides',
        color: '#3e6337',
        emblemUrl: '/vector/logo/atreides.svg',
        ruler: {
          status: 'unavailable',
          reference: {
            kind: 'faction-member',
            factionId: 'atreides',
            memberId: '00000000-0000-4000-8000-000000000001',
          },
        },
        leaders: [
          {
            status: 'unavailable',
            reference: {
              kind: 'faction-member',
              factionId: 'atreides',
              memberId: '00000000-0000-4000-8000-000000000002',
            },
          },
        ],
      },
    },
  ];
}

export function liveReferencePage(blocks: LiveReferenceBlock[]): RulebookRenderPageV1 {
  return {
    id: 'LIVE',
    anchor: 'live-reference',
    title: 'Components and factions',
    layoutId: 'single-column',
    showHeading: true,
    controlValues: {},
    regions: [{ key: 'content', blocks }],
  };
}
