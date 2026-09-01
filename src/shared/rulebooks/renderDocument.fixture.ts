import { getRulebookLayout } from './contents';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import type { RulebookRenderPageByLayoutV1 } from './renderDocument';

const chapterLayout = getRulebookLayout('chapter-opener');
const rulesLayout = getRulebookLayout('rules-page');
const referenceLayout = getRulebookLayout('visual-reference');

const chapterPage = {
  id: 'CHAP',
  anchor: 'welcome-to-arrakis',
  title: 'Welcome to Arrakis',
  layoutId: 'chapter-opener',
  controlValues: { 'chapter-label': 'Chapter one' },
  regions: [
    {
      key: chapterLayout.regions[1].key,
      blocks: [
        {
          id: 'HERA',
          kind: 'asset-figure',
          asset: { status: 'unselected' },
          text: 'Choose one published Asset to open this chapter.',
        },
      ],
    },
  ],
} satisfies RulebookRenderPageByLayoutV1<'chapter-opener'>;

const rulesBlocks = [
  {
    id: 'MVVE',
    kind: 'rule-group',
    title: 'Movement sequence',
    text: 'Choose a force, choose an adjacent destination, then resolve the move.',
  },
  {
    id: 'TEXT',
    kind: 'text',
    anchor: 'storm-boundary',
    text: 'The storm closes the boundary between its two sectors.',
  },
] satisfies RulebookRenderPageByLayoutV1<'rules-page'>['regions'][0]['blocks'];

const exampleBlocks = [
  {
    id: 'ASST',
    kind: 'asset-figure',
    asset: {
      status: 'ready',
      assetId: 'Storm marker',
      name: 'Storm marker',
      type: 'token-disc',
      imageUrl: '/page/storm.svg',
    },
    text: 'The storm closes the boundary between its two sectors.',
  },
  {
    id: 'L5ST',
    kind: 'repeated-text',
    items: [{ id: 'item-example', text: 'Confirm that the destination is adjacent.' }],
  },
] satisfies RulebookRenderPageByLayoutV1<'rules-page'>['regions'][1]['blocks'];

const rulesPage = {
  id: 'RULE',
  anchor: 'movement',
  title: 'Movement',
  layoutId: 'rules-page',
  controlValues: {
    guidance: {
      eyebrow: 'Rules page',
      introduction: 'Resolve movement in the order shown below.',
    },
  },
  regions: [
    { key: rulesLayout.regions[1].key, blocks: rulesBlocks },
    { key: rulesLayout.regions[2].key, blocks: exampleBlocks },
  ],
} satisfies RulebookRenderPageByLayoutV1<'rules-page'>;

const referencePage = {
  id: 'REFS',
  anchor: 'markers-and-tokens',
  title: 'Markers and tokens',
  layoutId: 'visual-reference',
  controlValues: {},
  regions: [
    { key: referenceLayout.regions[0].key, blocks: [] },
    {
      key: referenceLayout.regions[1].key,
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
} satisfies RulebookRenderPageByLayoutV1<'visual-reference'>;

const fixture = rulebookRenderDocumentV1Schema.parse({
  schemaVersion: 1,
  pageOrder: ['CHAP', 'RULE', 'REFS'],
  pagesById: {
    CHAP: chapterPage,
    RULE: rulesPage,
    REFS: referencePage,
  },
});

export function createRulebookRenderDocumentFixture() {
  return structuredClone(fixture);
}
