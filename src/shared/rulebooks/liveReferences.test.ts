import { describe, expect, it } from 'vitest';

import { resolveRulebookBoardDefinition } from './boardDefinitions';
import { rulebookContentsV1Schema, rulebookEditionContentsV1Schema } from './contents';
import type { RulebookContentsDraftV1 } from './contents';
import {
  projectRulebookDraftRenderDocument,
  projectRulebookRenderDocument,
  projectRulebookSource,
} from './projectRenderDocument';
import { collectRulebookReferenceIds } from './references';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from './settings';
import { RULEBOOK_STOCK_ARTWORK } from './sources';

function contents(): RulebookContentsDraftV1 {
  return rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['RULE'],
    pagesById: {
      RULE: {
        id: 'RULE',
        anchor: 'components',
        title: 'Components',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['ARTW', 'NVTR', 'FACT'] },
        blocksById: {
          ARTW: {
            id: 'ARTW',
            kind: 'referenced-illustration',
            source: { kind: 'asset', assetId: 'art' },
            caption: '*Literal artwork label',
          },
          NVTR: {
            id: 'NVTR',
            kind: 'illustrated-inventory',
            introduction: 'Choose *one*.',
            itemOrder: ['second', 'first'],
            itemsById: {
              first: {
                id: 'first',
                source: { kind: 'asset', assetId: 'art' },
                text: 'Keep this explanation.',
                quantity: 0,
                caption: 'An *unfinished label',
              },
              second: { id: 'second', text: 'A component without artwork.' },
            },
          },
          FACT: { id: 'FACT', kind: 'faction-introduction', factionId: 'faction', text: 'Keep this introduction.' },
        },
      },
    },
  });
}

function inventory(draft: RulebookContentsDraftV1) {
  const block = draft.pagesById.RULE!.blocksById.NVTR!;
  if (block.kind !== 'illustrated-inventory') {
    throw new Error('Expected inventory');
  }
  return block;
}

describe('Rulebook live source contracts', () => {
  it('keeps unavailable and blank selections distinct without dropping authored prose or literal captions', () => {
    const draft = contents();
    const document = projectRulebookRenderDocument(draft, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(document.pagesById.RULE!.regions[0]!.blocks).toEqual([
      {
        id: 'ARTW',
        kind: 'referenced-illustration',
        source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'art' } },
        caption: '*Literal artwork label',
      },
      {
        id: 'NVTR',
        kind: 'illustrated-inventory',
        introduction: 'Choose *one*.',
        items: [
          { id: 'second', source: { status: 'unselected' }, text: 'A component without artwork.' },
          {
            id: 'first',
            source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'art' } },
            text: 'Keep this explanation.',
            quantity: 0,
            caption: 'An *unfinished label',
          },
        ],
      },
      {
        id: 'FACT',
        kind: 'faction-introduction',
        faction: { status: 'unavailable', factionId: 'faction' },
        text: 'Keep this introduction.',
      },
    ]);
    const illustration = draft.pagesById.RULE!.blocksById.ARTW!;
    const faction = draft.pagesById.RULE!.blocksById.FACT!;
    if (illustration.kind !== 'referenced-illustration' || faction.kind !== 'faction-introduction') {
      throw new Error('Expected reference Blocks');
    }
    delete illustration.source;
    delete faction.factionId;
    expect(
      projectRulebookRenderDocument(draft, {}, DEFAULT_RULEBOOK_SETTINGS).pagesById.RULE!.regions[0]!.blocks
    ).toMatchObject([
      { source: { status: 'unselected' }, caption: '*Literal artwork label' },
      { introduction: 'Choose *one*.' },
      { faction: { status: 'unselected' }, text: 'Keep this introduction.' },
    ]);
  });

  it('collects saved and unsaved picks once across every reference location', () => {
    const draft = contents();
    inventory(draft).itemsById.second!.source = {
      kind: 'faction-member',
      factionId: 'faction',
      memberId: '00000000-0000-4000-8000-000000000001',
    };
    expect(
      collectRulebookReferenceIds(draft, {
        assetIds: ['unsaved', 'art', 'unsaved'],
        factionIds: ['unsaved-faction', 'faction', 'faction'],
      })
    ).toEqual({ assetIds: ['art', 'unsaved'], factionIds: ['faction', 'unsaved-faction'] });
  });

  it('resolves maintained artwork and missing artwork without treating arbitrary URLs as stock sources', () => {
    const artworkId = RULEBOOK_STOCK_ARTWORK[0]!;
    expect(projectRulebookSource({ kind: 'stock', artworkId }, {})).toMatchObject({
      status: 'ready',
      imageUrl: artworkId,
    });
    expect(projectRulebookSource({ kind: 'board', boardId: 'arrakis' }, {})).toMatchObject({
      status: 'ready',
      imageUrl: resolveRulebookBoardDefinition('arrakis')!.imageUrl,
    });
    for (const reference of [
      { kind: 'stock', artworkId: 'https://example.com/image.png' },
      { kind: 'board', boardId: 'gone' },
    ] as const) {
      expect(projectRulebookSource(reference, {})).toEqual({ status: 'unavailable', reference });
    }
  });

  it('keeps invalid introduction and item prose in previews but rejects it from current saved and published contracts', () => {
    const draft = contents();
    inventory(draft).introduction = 'An *unfinished introduction';
    inventory(draft).itemsById.first!.text = 'An *unfinished explanation';
    const preview = projectRulebookDraftRenderDocument(draft, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(preview.diagnostics.map(({ path }) => path)).toEqual([
      ['pagesById', 'RULE', 'blocksById', 'NVTR', 'introduction'],
      ['pagesById', 'RULE', 'blocksById', 'NVTR', 'itemsById', 'first', 'text'],
    ]);
    expect(rulebookContentsV1Schema.safeParse(draft).success).toBe(false);
    expect(rulebookRenderDocumentV1Schema.safeParse(preview.document).success).toBe(false);
  });

  it('rejects copied display fields, invalid identities and invalid quantities at the saved contract', () => {
    const valid = contents();
    expect(rulebookEditionContentsV1Schema.parse(valid)).toEqual(valid);
    for (const change of [
      (draft: RulebookContentsDraftV1) =>
        Object.assign(draft.pagesById.RULE!.blocksById.ARTW!, { imageUrl: '/copied.png' }),
      (draft: RulebookContentsDraftV1) =>
        Object.assign(inventory(draft).itemsById.first!, {
          source: { kind: 'faction-member', factionId: 'faction', memberId: 'by-name' },
        }),
      (draft: RulebookContentsDraftV1) => Object.assign(inventory(draft).itemsById.first!, { quantity: -1 }),
      (draft: RulebookContentsDraftV1) => Object.assign(inventory(draft).itemsById.first!, { quantity: 1.5 }),
      (draft: RulebookContentsDraftV1) =>
        Object.assign(draft.pagesById.RULE!.blocksById.FACT!, { name: 'Copied faction name' }),
    ]) {
      const invalid = structuredClone(valid);
      change(invalid);
      expect(rulebookContentsV1Schema.safeParse(invalid).success).toBe(false);
    }
  });
});
