import { rulebookContentsV1Schema } from './contents';
import type { RulebookContentsV1 } from './contents';

const capabilityStarter = rulebookContentsV1Schema.parse({
  schemaVersion: 1,
  pageOrder: ['CHAP', 'RULE', 'REFS'],
  pagesById: {
    CHAP: {
      id: 'CHAP',
      anchor: 'welcome-to-arrakis',
      title: 'Welcome to Arrakis',
      layoutId: 'chapter-opener',
      controlValues: { 'chapter-label': 'Chapter one' },
      blockOrderByRegion: { feature: ['HERA'] },
      blocksById: {
        HERA: {
          id: 'HERA',
          kind: 'asset-figure',
          text: 'A selected Asset with a short caption.',
        },
      },
    },
    RULE: {
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
      blockOrderByRegion: {
        rules: ['MVVE', 'TEXT'],
        examples: ['ASST', 'L5ST'],
      },
      blocksById: {
        MVVE: {
          id: 'MVVE',
          kind: 'rule-group',
          title: 'Movement sequence',
          text: 'Choose a force, choose an adjacent destination, then resolve the move.',
        },
        TEXT: {
          id: 'TEXT',
          kind: 'text',
          text: 'The storm closes the boundary between its two sectors.',
        },
        ASST: {
          id: 'ASST',
          kind: 'asset-figure',
          assetId: 'Storm marker',
          text: 'The storm closes the boundary between its two sectors.',
        },
        L5ST: {
          id: 'L5ST',
          kind: 'repeated-text',
          itemOrder: ['item-example'],
          itemsById: {
            'item-example': { id: 'item-example', text: 'Confirm that the destination is adjacent.' },
          },
        },
      },
    },
    REFS: {
      id: 'REFS',
      anchor: 'markers-and-tokens',
      title: 'Markers and tokens',
      layoutId: 'visual-reference',
      controlValues: {},
      blockOrderByRegion: {
        figures: [],
        notes: ['TEXT'],
      },
      blocksById: {
        TEXT: {
          id: 'TEXT',
          kind: 'text',
          anchor: 'marker-note',
          text: 'Place each marker beside the rule it helps explain.',
        },
      },
    },
  },
});

/** The capability-test Contents, cloned for each editor or contract scenario. */
export function createRulebookStarterContents(): RulebookContentsV1 {
  return structuredClone(capabilityStarter);
}

/** The route uses the same capability-test Contents as the contract and state-manager scenarios. */
export function createRulebookEditorialStarterContents(): RulebookContentsV1 {
  return createRulebookStarterContents();
}
