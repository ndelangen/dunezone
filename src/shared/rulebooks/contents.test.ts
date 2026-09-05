import { normalizeFormattedText } from '@shared/formattedText';
import { describe, expect, it } from 'vitest';

import {
  createRulebookLocalId,
  rulebookBlockKinds,
  rulebookContentsV1Schema,
  rulebookEditionContentsV1Schema,
  rulebookLayoutCatalogue,
  rulebookLocalIdAlphabet,
} from './contents';
import type { RulebookBlockKind, RulebookContentsV1, RulebookPageLayoutId } from './contents';
import { createRulebookStarterContents } from './fixtures';

const everyBlockKind = {
  text: true,
  'repeated-text': true,
  'rule-group': true,
  'asset-figure': true,
} satisfies Record<RulebookBlockKind, true>;

const everyPageLayout = {
  'chapter-opener': true,
  'rules-page': true,
  'visual-reference': true,
} satisfies Record<RulebookPageLayoutId, true>;

function cloneContents(): RulebookContentsV1 {
  return structuredClone(createRulebookStarterContents());
}

function rulesPage(contents: RulebookContentsV1) {
  const page = contents.pagesById.RULE;
  if (page?.layoutId !== 'rules-page') {
    throw new Error('Expected the RULE fixture Page');
  }
  return page;
}

function referencePage(contents: RulebookContentsV1) {
  const page = contents.pagesById.REFS;
  if (page?.layoutId !== 'visual-reference') {
    throw new Error('Expected the REFS fixture Page');
  }
  return page;
}

function chapterPage(contents: RulebookContentsV1) {
  const page = contents.pagesById.CHAP;
  if (page?.layoutId !== 'chapter-opener') {
    throw new Error('Expected the CHAP fixture Page');
  }
  return page;
}

function formattedText(value: string) {
  const normalized = normalizeFormattedText(value);
  if (!normalized.ok) {
    throw new Error('Expected valid fixture text');
  }
  return normalized.value;
}

describe('Rulebook Contents V1', () => {
  it('covers every Block kind and Page layout in the capability catalogue', () => {
    expect(Object.keys(everyBlockKind).sort()).toEqual([...rulebookBlockKinds].sort());
    expect(Object.keys(everyPageLayout).sort()).toEqual(rulebookLayoutCatalogue.map((layout) => layout.id).sort());
    expect(rulebookLayoutCatalogue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'chapter-opener' }),
        expect.objectContaining({ id: 'rules-page' }),
        expect.objectContaining({ id: 'visual-reference' }),
      ])
    );
  });

  it('represents ordered Control and Block regions without authored Region entities', () => {
    const rulesPage = rulebookLayoutCatalogue.find((layout) => layout.id === 'rules-page')!;
    expect(rulesPage.regions.map(({ kind, key }) => ({ kind, key }))).toEqual([
      { kind: 'control', key: 'guidance' },
      { kind: 'block', key: 'rules' },
      { kind: 'block', key: 'examples' },
    ]);
    expect(rulesPage.regions[0]).toMatchObject({ initialValue: { eyebrow: '', introduction: '' } });
    expect(rulesPage.regions[1]).toMatchObject({ cardinality: { minimum: 0, maximum: 6 } });
  });

  it('accepts the starter catalogue including empty regions and Page-local duplicate Block IDs', () => {
    const contents = cloneContents();
    expect(referencePage(contents).blockOrderByRegion.figures).toEqual([]);
    expect(rulesPage(contents).blocksById.TEXT).toBeDefined();
    expect(referencePage(contents).blocksById.TEXT).toBeDefined();
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(true);
  });

  it('reads text accepted by an earlier V1 contract without accepting it as a current write', () => {
    const contents = cloneContents();
    const feature = chapterPage(contents).blocksById.HERA;
    if (feature?.kind !== 'asset-figure') {
      throw new Error('Expected the HERA fixture Block');
    }
    feature.text = '__a__' as never;

    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
    const historicalFeature = rulebookEditionContentsV1Schema.parse(contents).pagesById.CHAP.blocksById.HERA;
    expect(historicalFeature).toMatchObject({ kind: 'asset-figure', text: '__a__' });
  });

  it('rejects a duplicate Block placement and an unplaced Page-owned Block', () => {
    const duplicate = cloneContents();
    rulesPage(duplicate).blockOrderByRegion.examples.push('TEXT');
    expect(rulebookContentsV1Schema.safeParse(duplicate).success).toBe(false);

    const unplaced = cloneContents();
    rulesPage(unplaced).blockOrderByRegion.rules = ['MVVE'];
    expect(rulebookContentsV1Schema.safeParse(unplaced).success).toBe(false);
  });

  it('enforces accepted kinds and region capacity', () => {
    const incompatible = cloneContents();
    rulesPage(incompatible).blockOrderByRegion.examples = ['MVVE', 'L5ST'];
    rulesPage(incompatible).blockOrderByRegion.rules = ['TEXT'];
    expect(rulebookContentsV1Schema.safeParse(incompatible).success).toBe(false);

    const overCapacity = cloneContents();
    const page = chapterPage(overCapacity);
    page.blocksById.AAAA = { id: 'AAAA', kind: 'asset-figure', text: formattedText('') };
    page.blocksById.AAAB = { id: 'AAAB', kind: 'asset-figure', text: formattedText('') };
    page.blockOrderByRegion.feature.push('AAAA', 'AAAB');
    expect(rulebookContentsV1Schema.safeParse(overCapacity).success).toBe(false);
  });

  it('enforces four-character unambiguous Page and Block IDs', () => {
    const contents = cloneContents();
    rulesPage(contents).blocksById['TOO-LONG'] = {
      id: 'TOO-LONG',
      kind: 'text',
      text: '',
    } as never;
    rulesPage(contents).blockOrderByRegion.rules.push('TOO-LONG');
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
  });

  it('issues opaque IDs from the 32-character alphabet and retries collisions', () => {
    const bytes = [new Uint8Array([0, 0, 0, 0]), new Uint8Array([1, 1, 1, 1])];
    const id = createRulebookLocalId(['2222'], () => bytes.shift()!);
    expect(id).toBe('3333');
    expect(id).toHaveLength(4);
    expect([...id].every((character) => rulebookLocalIdAlphabet.includes(character))).toBe(true);
  });

  it('fails closed when randomness cannot produce a unique ID', () => {
    expect(() => createRulebookLocalId(['2222'], () => new Uint8Array([0, 0, 0, 0]))).toThrow(
      'Could not issue a unique Rulebook ID'
    );
  });
});
