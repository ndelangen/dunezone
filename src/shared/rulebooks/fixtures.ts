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

/** The accepted two-Page bootstrap Contents, cloned for each editor or story scenario. */
export function createRulebookStarterContents(): RulebookContentsV1 {
  return structuredClone(starter);
}
