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

function expectIssue(value: unknown, path: readonly (string | number)[], message?: string) {
  const result = rulebookRenderDocumentV1Schema.safeParse(value);
  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }
  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path,
        ...(message ? { message: expect.stringContaining(message) } : {}),
      }),
    ])
  );
}

describe('Rulebook render document', () => {
  it('accepts one complete page-addressable document', () => {
    expect(rulebookRenderDocumentV1Schema.parse(document)).toEqual(document);
  });

  it('rejects invalid formatted text in the publishable contract', () => {
    expect.hasAssertions();
    const invalid = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: [{ blocks: [{ text: string }] }] } };
    };
    invalid.pagesById.RULE.regions[0].blocks[0].text = 'An *unfinished draft';

    expectIssue(invalid, ['pagesById', 'RULE', 'regions', 0, 'blocks', 0, 'text'], 'Formatted text must be valid');
  });

  it('rejects anchors shared by a Page and Block', () => {
    expect.hasAssertions();
    const duplicate = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: [{ blocks: [{ anchor: string }] }] } };
    };
    duplicate.pagesById.RULE.regions[0].blocks[0].anchor = 'movement';

    expectIssue(duplicate, ['pagesById'], 'Rendered anchor movement appears more than once');
  });

  it('rejects control values and cardinality outside the selected layout', () => {
    expect.hasAssertions();
    const wrongControl = structuredClone(document) as unknown as {
      pagesById: { RULE: { controlValues: { guidance: string } } };
    };
    wrongControl.pagesById.RULE.controlValues.guidance = 'not the guidance shape';
    expectIssue(wrongControl, ['pagesById', 'RULE', 'controlValues', 'guidance']);

    const overfull = structuredClone(document) as unknown as {
      pagesById: {
        RULE: { regions: [{ blocks: Array<{ id: string; kind: 'text'; text: string }> }] };
      };
    };
    overfull.pagesById.RULE.regions[0].blocks = ['TEX2', 'TEX3', 'TEX4', 'TEX5', 'TEX6', 'TEX7', 'TEX8'].map((id) => ({
      id,
      kind: 'text',
      text: 'Choose a destination.',
    }));
    expectIssue(overfull, ['pagesById', 'RULE', 'regions', 0, 'blocks']);
  });

  it('rejects missing or reordered regions and Block kinds outside a region contract', () => {
    expect.hasAssertions();
    const missingRegion = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: unknown[] } };
    };
    missingRegion.pagesById.RULE.regions.pop();
    expectIssue(missingRegion, ['pagesById', 'RULE', 'regions']);

    const wrongBlockKind = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: [{ blocks: unknown[] }] } };
    };
    wrongBlockKind.pagesById.RULE.regions[0].blocks[0] = {
      id: 'REPT',
      kind: 'repeated-text',
      items: [],
    };
    expectIssue(wrongBlockKind, ['pagesById', 'RULE', 'regions', 0, 'blocks', 0]);
  });

  it('rejects a Page map key that disagrees with its ID', () => {
    expect.hasAssertions();
    const wrongPageId = structuredClone(document) as unknown as {
      pagesById: { RULE: { id: string } };
    };
    wrongPageId.pagesById.RULE.id = 'PAGE';

    expectIssue(wrongPageId, ['pagesById', 'RULE', 'id'], 'Rendered Page map key and ID must agree');
  });

  it('rejects duplicate Block and repeated-item IDs in their identity scopes', () => {
    expect.hasAssertions();
    const duplicateBlock = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: [{ blocks: unknown[] }, { blocks: unknown[] }] } };
    };
    duplicateBlock.pagesById.RULE.regions[1].blocks.push({
      id: 'TEXT',
      kind: 'text',
      text: 'A second placement with the same ID.',
    });
    expectIssue(duplicateBlock, ['pagesById', 'RULE', 'regions'], 'Rendered Block TEXT appears more than once');

    const duplicateItem = structuredClone(document) as unknown as {
      pagesById: { RULE: { regions: [{ blocks: unknown[] }, { blocks: unknown[] }] } };
    };
    duplicateItem.pagesById.RULE.regions[1].blocks.push({
      id: 'REPT',
      kind: 'repeated-text',
      items: [
        { id: 'step', text: 'First.' },
        { id: 'step', text: 'Second.' },
      ],
    });
    expectIssue(
      duplicateItem,
      ['pagesById', 'RULE', 'regions', 1, 'blocks', 0, 'items'],
      'Rendered repeated item step appears more than once'
    );
  });

  it('requires every rendered Page exactly once in pageOrder', () => {
    expect.hasAssertions();
    const missingPage = structuredClone(document) as unknown as { pageOrder: string[] };
    missingPage.pageOrder = [];

    expectIssue(missingPage, ['pageOrder'], 'Every rendered Page must appear exactly once');
  });
});
