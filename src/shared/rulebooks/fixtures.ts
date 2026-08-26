import { rulebookContentsV1Schema } from './contents';
import type { RulebookContentsV1 } from './contents';

const starter = rulebookContentsV1Schema.parse({
  schemaVersion: 1,
  pageOrder: ['page-introduction', 'page-reference'],
  pagesById: {
    'page-introduction': {
      id: 'page-introduction',
      anchor: 'introduction',
      layoutId: 'single-column',
      slots: { body: ['block-introduction'] },
    },
    'page-reference': {
      id: 'page-reference',
      anchor: 'reference',
      layoutId: 'two-columns',
      slots: {
        left: ['block-summary'],
        right: ['block-examples'],
      },
    },
  },
  blocksById: {
    'block-introduction': {
      id: 'block-introduction',
      kind: 'text',
      anchor: 'welcome',
      text: '',
    },
    'block-summary': {
      id: 'block-summary',
      kind: 'text',
      text: '',
    },
    'block-examples': {
      id: 'block-examples',
      kind: 'repeated-text',
      itemOrder: ['item-example'],
      itemsById: {
        'item-example': { id: 'item-example', text: '' },
      },
    },
  },
});

const editorialStarter = rulebookContentsV1Schema.parse({
  schemaVersion: 1,
  pageOrder: ['page-welcome', 'page-movement', 'page-markers'],
  pagesById: {
    'page-welcome': {
      id: 'page-welcome',
      anchor: 'welcome-to-arrakis',
      title: 'Welcome to Arrakis',
      layoutId: 'chapter-opener',
      slots: { body: ['block-arrakis-hero'] },
    },
    'page-movement': {
      id: 'page-movement',
      anchor: 'movement',
      title: 'Movement',
      layoutId: 'rules-page',
      slots: { body: ['block-movement-sequence', 'block-storm-marker'] },
    },
    'page-markers': {
      id: 'page-markers',
      anchor: 'markers-and-tokens',
      title: 'Markers and tokens',
      layoutId: 'visual-reference',
      slots: { body: ['block-token-reference', 'block-marker-example'] },
    },
  },
  blocksById: {
    'block-arrakis-hero': {
      id: 'block-arrakis-hero',
      kind: 'asset-figure',
      title: 'Arrakis hero image',
      text: 'A selected Asset with a short caption.',
    },
    'block-movement-sequence': {
      id: 'block-movement-sequence',
      kind: 'rule-group',
      title: 'Movement sequence',
      text: 'Choose a force, choose an adjacent destination, then resolve the move.',
    },
    'block-storm-marker': {
      id: 'block-storm-marker',
      kind: 'asset-figure',
      title: 'Storm marker',
      text: 'The storm closes the boundary between its two sectors.',
    },
    'block-token-reference': {
      id: 'block-token-reference',
      kind: 'asset-figure',
      title: 'Token reference',
      text: 'Identify the markers used during play.',
    },
    'block-marker-example': {
      id: 'block-marker-example',
      kind: 'worked-example',
      title: 'Marker placement',
      text: 'Place each marker beside the rule it helps explain.',
    },
  },
});

/** The accepted two-Page bootstrap Contents, cloned for each editor or story scenario. */
export function createRulebookStarterContents(): RulebookContentsV1 {
  return structuredClone(starter);
}

/** The accepted editorial catalogue fixture, cloned for editor and contract scenarios. */
export function createRulebookEditorialStarterContents(): RulebookContentsV1 {
  return structuredClone(editorialStarter);
}
