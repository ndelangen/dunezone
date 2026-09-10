import { describe, expect, test } from 'vitest';

import { rulebookContentsV1Schema, rulebookDraftEntitySchemas, rulebookEditionContentsV1Schema } from './contents';
import type { RulebookContentsDraftV1 } from './contents';
import { projectRulebookDraftRenderDocument, projectRulebookRenderDocument } from './projectRenderDocument';
import { collectRulebookReferenceIds } from './references';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from './settings';

function cardGuides(): RulebookContentsDraftV1 {
  return {
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'cards',
        title: 'Cards',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['CARD', 'GRUP'] },
        blocksById: {
          CARD: {
            id: 'CARD',
            kind: 'card-entry',
            anchor: 'lasgun',
            source: { kind: 'asset', assetId: 'lasgun' },
            text: 'Keep this *guidance*.',
            quantity: 0,
          },
          GRUP: {
            id: 'GRUP',
            kind: 'card-group',
            anchor: 'weapons',
            title: 'Weapons',
            text: 'Choose a weapon.',
            variant: 'featured-member',
            featuredItemId: 'maula',
            itemOrder: ['crysknife', 'maula'],
            itemsById: {
              maula: {
                id: 'maula',
                source: { kind: 'asset', assetId: 'maula' },
                text: 'Keep this member guidance.',
                quantity: 2,
              },
              crysknife: { id: 'crysknife', source: { kind: 'asset', assetId: 'crysknife' }, text: '' },
            },
          },
        },
      },
    },
  };
}

function guides(contents: RulebookContentsDraftV1) {
  const { CARD: entry, GRUP: group } = contents.pagesById.PAGE.blocksById;
  if (entry.kind !== 'card-entry' || group.kind !== 'card-group') {
    throw new Error('Expected Card guides');
  }
  return { entry, group };
}

describe('Rulebook Card guide contracts', () => {
  test('resolves treachery Cards while preserving authored quantities, guidance and unavailable selections', () => {
    const contents = cardGuides();
    const document = projectRulebookRenderDocument(
      contents,
      {
        lasgun: { assetId: 'lasgun', name: 'Lasgun', type: 'card-treachery', imageUrl: '/published/lasgun.png' },
        maula: { assetId: 'maula', name: 'Token', type: 'token-disc', imageUrl: '/published/token.png' },
      },
      DEFAULT_RULEBOOK_SETTINGS
    );
    expect(document.pagesById.PAGE.regions[0]?.blocks).toMatchObject([
      { source: { status: 'ready', name: 'Lasgun' }, text: 'Keep this *guidance*.', quantity: 0 },
      {
        title: 'Weapons',
        featuredItemId: 'maula',
        items: [
          { id: 'crysknife', source: { status: 'unavailable' }, text: '' },
          { id: 'maula', source: { status: 'unavailable' }, text: 'Keep this member guidance.', quantity: 2 },
        ],
      },
    ]);
    expect(collectRulebookReferenceIds(contents, { assetIds: ['maula', 'new-card'] })).toEqual({
      assetIds: ['crysknife', 'lasgun', 'maula', 'new-card'],
      factionIds: [],
    });
  });

  test('allows unfinished entries and empty groups in every treatment without losing hidden authored fields', () => {
    const contents = cardGuides();
    const { entry, group } = guides(contents);
    delete entry.source;
    entry.text = '';
    for (const variant of ['compact', 'gallery', 'featured-member'] as const) {
      group.variant = variant;
      expect(rulebookContentsV1Schema.parse(contents).pagesById.PAGE.blocksById.GRUP).toEqual(group);
    }
    group.itemOrder = [];
    group.itemsById = {};
    delete group.featuredItemId;
    const document = projectRulebookRenderDocument(
      rulebookContentsV1Schema.parse(contents),
      {},
      DEFAULT_RULEBOOK_SETTINGS
    );
    expect(document.pagesById.PAGE.regions[0]?.blocks).toMatchObject([
      { source: { status: 'unselected' }, text: '', quantity: 0 },
      { items: [], title: 'Weapons', text: 'Choose a weapon.' },
    ]);
  });

  test('keeps featured membership tied to stable entries and rejects dangling or duplicated members at final validation', () => {
    const contents = cardGuides();
    const { group } = guides(contents);
    group.itemOrder.reverse();
    const document = projectRulebookRenderDocument(
      rulebookContentsV1Schema.parse(contents),
      {},
      DEFAULT_RULEBOOK_SETTINGS
    );
    expect(document.pagesById.PAGE.regions[0]?.blocks[1]).toMatchObject({
      featuredItemId: 'maula',
      items: [{ id: 'maula', quantity: 2 }, { id: 'crysknife' }],
    });
    for (const featuredItemId of ['missing', 'constructor', '__proto__']) {
      group.featuredItemId = featuredItemId;
      expect(rulebookDraftEntitySchemas.block.safeParse(group).success).toBe(true);
      expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
    }
    expect(
      rulebookRenderDocumentV1Schema.safeParse(
        projectRulebookDraftRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS).document
      ).success
    ).toBe(false);
    delete group.featuredItemId;
    group.itemOrder = ['maula', 'maula'];
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
  });

  test('reads accepted Edition spelling while diagnosing invalid shared and member guidance in raw drafts', () => {
    const contents = cardGuides();
    const { entry, group } = guides(contents);
    entry.text = '__a__';
    group.text = '__a__';
    group.itemsById.maula.text = '__a__';
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
    const edition = rulebookEditionContentsV1Schema.parse(contents);
    expect(() => projectRulebookRenderDocument(edition, {}, DEFAULT_RULEBOOK_SETTINGS)).not.toThrow();
    entry.text = 'An *unfinished entry';
    group.text = 'An *unfinished group';
    group.itemsById.maula.text = 'An *unfinished member';
    expect(
      projectRulebookDraftRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS).diagnostics.map(({ path }) => path)
    ).toEqual([
      ['pagesById', 'PAGE', 'blocksById', 'CARD', 'text'],
      ['pagesById', 'PAGE', 'blocksById', 'GRUP', 'text'],
      ['pagesById', 'PAGE', 'blocksById', 'GRUP', 'itemsById', 'maula', 'text'],
    ]);
  });
});
