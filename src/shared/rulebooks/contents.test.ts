import { describe, expect, it } from 'vitest';

import {
  createRulebookLocalId,
  rulebookContentsV1Schema,
  rulebookEditionContentsV1Schema,
  rulebookLayoutCatalogue,
  rulebookLocalIdAlphabet,
} from './contents';
import type { RulebookContentsV1 } from './contents';
import { createRulebookStarterContents } from './fixtures';

function cloneContents(): RulebookContentsV1 {
  return structuredClone(createRulebookStarterContents());
}

function rulesPage(contents: RulebookContentsV1) {
  const page = contents.pagesById.RULE;
  if (page?.layoutId !== 'two-columns') {
    throw new Error('Expected the RULE fixture Page');
  }
  return page;
}

function referencePage(contents: RulebookContentsV1) {
  const page = contents.pagesById.REFS;
  if (page?.layoutId !== 'single-column') {
    throw new Error('Expected the REFS fixture Page');
  }
  return page;
}

function movementRule(contents: RulebookContentsV1) {
  const block = rulesPage(contents).blocksById.MVVE;
  if (block?.kind !== 'text') {
    throw new Error('Expected the MVVE fixture Block');
  }
  return block;
}

describe('Rulebook Contents V1', () => {
  it('represents ordered Control and Block regions without authored Region entities', () => {
    const cover = rulebookLayoutCatalogue.find((layout) => layout.id === 'cover')!;
    expect(cover.regions.map(({ kind, key }) => ({ kind, key }))).toEqual([
      { kind: 'control', key: 'cover' },
      { kind: 'control', key: 'footer' },
    ]);
    expect(cover.regions[1]).toMatchObject({ initialValue: { enabled: false, title: '', label: '' } });
    const outerRail = rulebookLayoutCatalogue.find((layout) => layout.id === 'outer-rail')!;
    expect(outerRail.regions.map(({ kind, key }) => ({ kind, key }))).toEqual([
      { kind: 'block', key: 'rail' },
      { kind: 'block', key: 'column1' },
      { kind: 'block', key: 'column2' },
    ]);
    expect(outerRail.regions[0]).toMatchObject({ cardinality: { minimum: 0, maximum: null } });
  });

  it('accepts the starter catalogue including an emptied region and Page-local duplicate Block IDs', () => {
    const contents = cloneContents();
    expect(rulesPage(contents).blocksById.TEXT).toBeDefined();
    expect(referencePage(contents).blocksById.TEXT).toBeDefined();
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(true);
    referencePage(contents).blockOrderByRegion.content = [];
    delete referencePage(contents).blocksById.TEXT;
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(true);
  });

  it('reads text accepted by an earlier V1 contract without accepting it as a current write', () => {
    const contents = cloneContents();
    movementRule(contents).text = '__a__' as never;

    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
    const historical = rulebookEditionContentsV1Schema.parse(contents).pagesById.RULE.blocksById.MVVE;
    expect(historical).toMatchObject({ kind: 'text', text: '__a__' });
  });

  it('keeps Block anchors strict when reading an Edition', () => {
    const contents = cloneContents();
    movementRule(contents).anchor = 'Not valid' as never;

    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
    expect(rulebookEditionContentsV1Schema.safeParse(contents).success).toBe(false);
  });

  it('rejects a duplicate Block placement and an unplaced Page-owned Block', () => {
    const duplicate = cloneContents();
    rulesPage(duplicate).blockOrderByRegion.column2.push('TEXT');
    expect(rulebookContentsV1Schema.safeParse(duplicate).success).toBe(false);

    const unplaced = cloneContents();
    rulesPage(unplaced).blockOrderByRegion.column1 = ['MVVE'];
    expect(rulebookContentsV1Schema.safeParse(unplaced).success).toBe(false);
  });

  it('rejects a Block placed in a region its layout does not have', () => {
    const contents = cloneContents();
    (rulesPage(contents).blockOrderByRegion as Record<string, string[]>).rail = [];
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
  });

  it('enforces four-character unambiguous Page and Block IDs', () => {
    const contents = cloneContents();
    rulesPage(contents).blocksById['TOO-LONG'] = {
      id: 'TOO-LONG',
      kind: 'text',
      text: '',
    } as never;
    rulesPage(contents).blockOrderByRegion.column1.push('TOO-LONG');
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
