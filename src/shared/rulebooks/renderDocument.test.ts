import { describe, expect, it } from 'vitest';

import { rulebookRenderDocumentV1Schema } from './renderDocument';

const document = {
  schemaVersion: 1,
  pageOrder: ['RULE'],
  pagesById: {
    RULE: {
      id: 'RULE',
      anchor: 'movement',
      title: 'Movement',
      layoutId: 'rules-page',
      controlValues: {
        guidance: { eyebrow: 'Rules', introduction: 'Resolve movement in order.' },
      },
      regions: [
        {
          key: 'rules',
          blocks: [{ id: 'TEXT', kind: 'text', anchor: 'sequence', text: 'Choose a destination.' }],
        },
        { key: 'examples', blocks: [] },
      ],
    },
  },
} as const;

describe('Rulebook render document', () => {
  it('accepts one complete page-addressable document', () => {
    expect(rulebookRenderDocumentV1Schema.parse(document)).toEqual(document);
  });

  it('rejects invalid formatted text in the publishable contract', () => {
    const invalid = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: [{ blocks: [{ text: string }] }] } };
    };
    invalid.pagesById.RULE.regions[0].blocks[0].text = 'An *unfinished draft';

    expect(() => rulebookRenderDocumentV1Schema.parse(invalid)).toThrow('Formatted text must be valid');
  });

  it('rejects anchors shared by a Page and Block', () => {
    const duplicate = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: [{ blocks: [{ anchor: string }] }] } };
    };
    duplicate.pagesById.RULE.regions[0].blocks[0].anchor = 'movement';

    expect(() => rulebookRenderDocumentV1Schema.parse(duplicate)).toThrow(
      'Rendered anchor movement appears more than once'
    );
  });

  it('rejects control values and cardinality outside the selected layout', () => {
    const wrongControl = structuredClone(document) as unknown as {
      pagesById: { RULE: { controlValues: { guidance: string } } };
    };
    wrongControl.pagesById.RULE.controlValues.guidance = 'not the guidance shape';
    expect(() => rulebookRenderDocumentV1Schema.parse(wrongControl)).toThrow(
      'Rendered control guidance must follow the rules-page layout'
    );

    const overfull = structuredClone(document) as unknown as {
      pagesById: {
        RULE: { regions: [{ blocks: Array<{ id: string; kind: 'text'; anchor: string; text: string }> }] };
      };
    };
    overfull.pagesById.RULE.regions[0].blocks = Array.from({ length: 7 }, (_, index) => ({
      ...document.pagesById.RULE.regions[0].blocks[0],
      id: `TEXT-${index}`,
      anchor: `sequence-${index}`,
    }));
    expect(() => rulebookRenderDocumentV1Schema.parse(overfull)).toThrow(
      'Rendered region rules accepts at most 6 Blocks'
    );
  });
});
