import { describe, expect, it } from 'vitest';

import {
  getRulebookLayoutsForSize,
  getRulebookRegionOrder,
  isRulebookLayoutSupported,
  rulebookContentsV1Schema,
  rulebookDraftEntitySchemas,
  rulebookEditionContentsV1Schema,
} from './contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from './contents';
import { projectRulebookDraftRenderDocument, projectRulebookRenderDocument } from './projectRenderDocument';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from './settings';

function writtenRules(): RulebookContentsDraftV1 {
  const blocks: RulebookBlockDraft[] = [
    { id: 'HEAD', kind: 'section-heading', title: 'Movement', factionId: 'faction-fremen' },
    { id: 'TEXT', kind: 'text', name: 'Range', text: 'Move one group.' },
    {
      id: 'L5ST',
      kind: 'list',
      style: 'numbered',
      itemOrder: ['choose', 'move'],
      itemsById: {
        choose: { id: 'choose', name: 'Choose forces', text: 'Choose one group.' },
        move: { id: 'move', name: 'Move', text: 'Place that group in its destination.' },
      },
    },
    {
      id: 'N8TE',
      kind: 'callout',
      variant: 'quotation',
      title: 'Movement example',
      text: 'Move together.',
      attribution: 'The example author',
    },
    {
      id: 'QANS',
      kind: 'question-answer',
      topic: 'Storm',
      question: 'Can forces cross the storm?',
      answer: 'Apply the storm rules.',
    },
  ];
  return {
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'movement',
        title: 'Movement',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: blocks.map(({ id }) => id) },
        blocksById: Object.fromEntries(blocks.map((block) => [block.id, block])),
      },
    },
  };
}

function onePage(page: RulebookPageDraft): RulebookContentsDraftV1 {
  return { schemaVersion: 1, pageOrder: [page.id], pagesById: { [page.id]: page } };
}

describe('Rulebook production catalogue', () => {
  it('offers only supported grids and never offers the temporary capability layouts', () => {
    expect(getRulebookLayoutsForSize('tall').map(({ id }) => id)).toEqual(['single-column', 'cover']);
    expect(getRulebookLayoutsForSize('square')).toEqual(getRulebookLayoutsForSize('a4'));
    expect(getRulebookLayoutsForSize('a4')).toHaveLength(6);
    expect(isRulebookLayoutSupported('two-columns', 'tall')).toBe(false);
    expect(isRulebookLayoutSupported('chapter-opener', 'a4')).toBe(false);
  });

  it('accepts each offered grid with its initial controls and blank regions', () => {
    for (const layout of getRulebookLayoutsForSize('a4')) {
      const page = {
        id: 'PAGE',
        anchor: 'draft-page',
        title: '',
        layoutId: layout.id,
        controlValues:
          layout.id === 'wide-narrow'
            ? { widePosition: 'left' }
            : layout.id === 'band-columns'
              ? { bandPosition: 'top' }
              : Object.fromEntries(
                  layout.regions.flatMap((region) =>
                    region.kind === 'control' ? [[region.key, region.initialValue]] : []
                  )
                ),
        blockOrderByRegion: Object.fromEntries(
          layout.regions.flatMap((region) => (region.kind === 'block' ? [[region.key, []]] : []))
        ),
        blocksById: {},
      };
      const parsed = rulebookContentsV1Schema.parse({
        schemaVersion: 1,
        pageOrder: ['PAGE'],
        pagesById: { PAGE: page },
      });
      expect(parsed.pagesById.PAGE).toMatchObject({ showHeading: true });
      expect(projectRulebookRenderDocument(parsed, {}, DEFAULT_RULEBOOK_SETTINGS).pagesById.PAGE.layoutId).toBe(
        layout.id
      );
    }
  });

  it('keeps written content valid beyond the dummy six-Block capacity', () => {
    const contents = writtenRules();
    const page = contents.pagesById.PAGE;
    if (page.layoutId !== 'single-column') {
      throw new Error('Expected one reading region');
    }
    for (const id of ['TEX2', 'TEX3', 'TEX4']) {
      page.blocksById[id] = { id, kind: 'text', text: '' };
      page.blockOrderByRegion.content.push(id);
    }
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(true);
  });

  it('preserves stable list entry names and text through reordering and draft operation parsing', () => {
    const contents = writtenRules();
    const list = contents.pagesById.PAGE.blocksById.L5ST;
    if (list.kind !== 'list') {
      throw new Error('Expected a procedure');
    }
    list.itemOrder.reverse();
    expect(rulebookDraftEntitySchemas.item.parse(list.itemsById.choose)).toEqual(list.itemsById.choose);
    const document = projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(document.pagesById.PAGE.regions[0]?.blocks.find(({ id }) => id === 'L5ST')).toMatchObject({
      items: [list.itemsById.move, list.itemsById.choose],
    });
    list.itemOrder = ['choose', 'choose'];
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
  });

  it('reads prior accepted text in every new formatted field without allowing that spelling in new writes', () => {
    const contents = writtenRules();
    const blocks = contents.pagesById.PAGE.blocksById;
    if (
      blocks.TEXT.kind !== 'text' ||
      blocks.L5ST.kind !== 'list' ||
      blocks.N8TE.kind !== 'callout' ||
      blocks.QANS.kind !== 'question-answer'
    ) {
      throw new Error('Expected the written-rule catalogue');
    }
    blocks.TEXT.text = '__a__';
    blocks.L5ST.itemsById.choose.text = '__a__';
    blocks.N8TE.text = '__a__';
    blocks.QANS.question = '__a__';
    blocks.QANS.answer = '__a__';
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
    const edition = rulebookEditionContentsV1Schema.parse(contents);
    expect(() => projectRulebookRenderDocument(edition, {}, DEFAULT_RULEBOOK_SETTINGS)).not.toThrow();
    blocks.QANS.answer = 'Unfinished *emphasis';
    const preview = projectRulebookDraftRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(preview.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['pagesById', 'PAGE', 'blocksById', 'QANS', 'answer'] })])
    );
    expect(rulebookRenderDocumentV1Schema.safeParse(preview.document).success).toBe(false);
  });

  it('resolves a live faction association without replacing the authored heading', () => {
    const contents = writtenRules();
    const available = projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS, {
      'faction-fremen': { factionId: 'faction-fremen', name: 'Fremen', color: '#b68531' },
    });
    expect(available.pagesById.PAGE.regions[0]?.blocks[0]).toMatchObject({
      title: 'Movement',
      faction: { status: 'ready', factionId: 'faction-fremen', name: 'Fremen', color: '#b68531' },
    });
    const unavailable = projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(unavailable.pagesById.PAGE.regions[0]?.blocks[0]).toMatchObject({
      title: 'Movement',
      faction: { status: 'unavailable', factionId: 'faction-fremen' },
    });
  });

  it('projects Cover artwork as a reference while preserving blank text and unavailable identity', () => {
    const contents = onePage({
      id: 'CVER',
      anchor: 'cover',
      title: 'Field guide',
      layoutId: 'cover',
      showHeading: true,
      controlValues: { cover: { artworkAssetId: 'asset-cover', subtitle: '', supportingText: '' } },
      blockOrderByRegion: {},
      blocksById: {},
    });
    const unavailable = projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(unavailable.pagesById.CVER).toMatchObject({
      regions: [],
      controlValues: {
        cover: { artwork: { status: 'unavailable', assetId: 'asset-cover' }, subtitle: '', supportingText: '' },
      },
    });
    const available = projectRulebookRenderDocument(
      contents,
      {
        'asset-cover': {
          assetId: 'asset-cover',
          name: 'Cover artwork',
          type: 'treachery-card',
          imageUrl: '/current-cover.jpg',
        },
      },
      DEFAULT_RULEBOOK_SETTINGS
    );
    expect(available.pagesById.CVER).toMatchObject({
      controlValues: { cover: { artwork: { status: 'ready', imageUrl: '/current-cover.jpg' } } },
    });
  });

  it('derives reading order from fixed arrangements and complete-book Page side', () => {
    expect(getRulebookRegionOrder({ layoutId: 'wide-narrow', controlValues: { widePosition: 'right' } }, 1)).toEqual([
      'narrow',
      'wide',
    ]);
    expect(getRulebookRegionOrder({ layoutId: 'band-columns', controlValues: { bandPosition: 'bottom' } }, 1)).toEqual([
      'column1',
      'column2',
      'band',
    ]);
    const rail = { layoutId: 'outer-rail', controlValues: {} } as const;
    expect(getRulebookRegionOrder(rail, 2)).toEqual(['rail', 'column1', 'column2']);
    expect(getRulebookRegionOrder(rail, 3)).toEqual(['column1', 'column2', 'rail']);
  });
});
