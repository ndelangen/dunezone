import { rulebookRenderDocumentV1Schema } from './renderDocument';
import type { RulebookRenderPageByLayoutV1 } from './renderDocument';

/* The rendered twin of the shared test starter: the same three Pages and IDs, projected, with the storm marker resolved. */
const coverPage = {
  id: 'CHAP',
  anchor: 'welcome-to-arrakis',
  title: 'Welcome to Arrakis',
  layoutId: 'cover',
  showHeading: true,
  controlValues: {
    cover: {
      artwork: { status: 'unselected' },
      backgroundImageUrl: '',
      showDuneLogo: true,
      showSubtitle: true,
      subtitle: 'Chapter one',
      supportingText: 'A selected Asset with a short caption.',
    },
  },
  regions: [],
} satisfies RulebookRenderPageByLayoutV1<'cover'>;

const rulesPage = {
  id: 'RULE',
  anchor: 'movement',
  title: 'Movement',
  layoutId: 'two-columns',
  showHeading: true,
  controlValues: {},
  regions: [
    {
      key: 'column1',
      blocks: [
        {
          id: 'MVVE',
          kind: 'text',
          name: 'Movement sequence',
          text: 'Choose a force, choose an adjacent destination, then resolve the move.',
        },
        {
          id: 'TEXT',
          kind: 'text',
          anchor: 'storm-boundary',
          text: 'The storm closes the boundary between its two sectors.',
        },
      ],
    },
    {
      key: 'column2',
      blocks: [
        {
          id: 'ASST',
          kind: 'referenced-illustration',
          source: {
            status: 'ready',
            reference: { kind: 'asset', assetId: 'Storm marker' },
            name: 'Storm marker',
            imageUrl: '/page/storm.svg',
          },
          caption: 'The storm closes the boundary between its two sectors.',
        },
        {
          id: 'L5ST',
          kind: 'list',
          style: 'numbered',
          items: [{ id: 'item-example', text: 'Confirm that the destination is adjacent.' }],
        },
      ],
    },
  ],
} satisfies RulebookRenderPageByLayoutV1<'two-columns'>;

const referencePage = {
  id: 'REFS',
  anchor: 'markers-and-tokens',
  title: 'Markers and tokens',
  layoutId: 'single-column',
  showHeading: true,
  controlValues: {},
  regions: [
    {
      key: 'content',
      blocks: [
        {
          id: 'NOTE',
          kind: 'text',
          anchor: 'marker-note',
          text: 'Place each marker beside the rule it helps explain.',
        },
      ],
    },
  ],
} satisfies RulebookRenderPageByLayoutV1<'single-column'>;

const fixture = rulebookRenderDocumentV1Schema.parse({
  schemaVersion: 1,
  pageOrder: ['CHAP', 'RULE', 'REFS'],
  pagesById: {
    CHAP: coverPage,
    RULE: rulesPage,
    REFS: referencePage,
  },
});

export function createRulebookRenderDocumentFixture() {
  return structuredClone(fixture);
}
