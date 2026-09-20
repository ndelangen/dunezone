import { rulebookContentsV1Schema } from './contents';
import type { RulebookContentsV1 } from './contents';

/*
 * A three-Page book on the fixed catalogue: a Cover with its two Control regions, a two-column interior with four written Blocks, and a single-column interior with one anchored Block.
 * Page and Block IDs are the ones editor seams, stories and journeys navigate by, so a scenario names `RULE/MVVE` the same way it always did.
 */
const testStarter = rulebookContentsV1Schema.parse({
  schemaVersion: 1,
  pageOrder: ['CHAP', 'RULE', 'REFS'],
  pagesById: {
    CHAP: {
      id: 'CHAP',
      anchor: 'welcome-to-arrakis',
      title: 'Welcome to Arrakis',
      layoutId: 'cover',
      showHeading: true,
      controlValues: {
        cover: {
          backgroundImageUrl: '',
          showDuneLogo: true,
          showSubtitle: true,
          subtitle: 'Chapter one',
          supportingText: 'A selected Asset with a short caption.',
        },
        footer: { enabled: false, title: '', label: '' },
      },
      blockOrderByRegion: {},
      blocksById: {},
    },
    RULE: {
      id: 'RULE',
      anchor: 'movement',
      title: 'Movement',
      layoutId: 'two-columns',
      showHeading: true,
      controlValues: {},
      blockOrderByRegion: {
        column1: ['MVVE', 'TEXT'],
        column2: ['ASST', 'L5ST'],
      },
      blocksById: {
        MVVE: {
          id: 'MVVE',
          kind: 'text',
          name: 'Movement sequence',
          text: 'Choose a force, choose an adjacent destination, then resolve the move.',
        },
        TEXT: {
          id: 'TEXT',
          kind: 'text',
          text: 'The storm closes the boundary between its two sectors.',
        },
        ASST: {
          id: 'ASST',
          kind: 'referenced-illustration',
          caption: 'The storm closes the boundary between its two sectors.',
        },
        L5ST: {
          id: 'L5ST',
          kind: 'list',
          style: 'numbered',
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
      layoutId: 'single-column',
      showHeading: true,
      controlValues: {},
      blockOrderByRegion: { content: ['TEXT'] },
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

/** The three-Page test Contents, cloned for each editor or contract scenario. */
export function createRulebookStarterContents(): RulebookContentsV1 {
  return structuredClone(testStarter);
}

/** A new Rulebook starts with a supported Page and editable written content. */
export function createRulebookEditorialStarterContents(): RulebookContentsV1 {
  return rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['RULE'],
    pagesById: {
      RULE: {
        id: 'RULE',
        anchor: 'introduction',
        title: 'Introduction',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['TEXT', 'L5ST'] },
        blocksById: {
          TEXT: { id: 'TEXT', kind: 'text', text: '' },
          L5ST: {
            id: 'L5ST',
            kind: 'list',
            style: 'numbered',
            itemOrder: ['step-one'],
            itemsById: { 'step-one': { id: 'step-one', text: '' } },
          },
        },
      },
    },
  });
}
