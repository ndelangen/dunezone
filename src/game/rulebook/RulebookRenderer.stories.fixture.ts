import { rulebookRenderDocumentV1Schema } from '@shared/rulebooks/renderDocument';

const fixture = rulebookRenderDocumentV1Schema.parse({
  schemaVersion: 1,
  pageOrder: ['CHAP', 'RULE', 'REFS'],
  pagesById: {
    CHAP: {
      id: 'CHAP',
      anchor: 'welcome-to-arrakis',
      title: 'Welcome to Arrakis',
      layoutId: 'chapter-opener',
      controlValues: { 'chapter-label': 'Chapter one' },
      regions: [
        {
          key: 'feature',
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
    },
    RULE: {
      id: 'RULE',
      anchor: 'movement',
      title: 'Movement',
      layoutId: 'rules-page',
      controlValues: {
        guidance: { eyebrow: 'Rules page', introduction: 'Resolve movement in the order shown below.' },
      },
      regions: [
        {
          key: 'rules',
          blocks: [
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
          ],
        },
        {
          key: 'examples',
          blocks: [
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
          ],
        },
      ],
    },
    REFS: {
      id: 'REFS',
      anchor: 'markers-and-tokens',
      title: 'Markers and tokens',
      layoutId: 'visual-reference',
      controlValues: {},
      regions: [
        { key: 'figures', blocks: [] },
        {
          key: 'notes',
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
    },
  },
});

export function createRulebookRenderDocumentFixture() {
  return structuredClone(fixture);
}
