import { describe, expect, test } from 'vitest';

import {
  findRulebookItem,
  rulebookContentsV1Schema,
  rulebookDraftEntitySchemas,
  rulebookEditionContentsV1Schema,
  rulebookItemCollections,
} from './contents';
import type { RulebookContentsDraftV1 } from './contents';

function referenceMatter(): RulebookContentsDraftV1 {
  return {
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'reference',
        title: 'Reference',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['TABL', 'CRED'] },
        blocksById: {
          TABL: {
            id: 'TABL',
            kind: 'reference-table',
            columnOrder: ['faction', 'revival'],
            columnsById: {
              faction: { id: 'faction', label: 'Faction' },
              revival: { id: 'revival', label: 'Free revival' },
            },
            rowOrder: ['atreides'],
            rowsById: { atreides: { id: 'atreides', cellsByColumnId: { faction: 'Atreides' } } },
            note: '',
          },
          CRED: {
            id: 'CRED',
            kind: 'credits',
            groupOrder: ['design'],
            groupsById: {
              design: {
                id: 'design',
                heading: 'Game design',
                contributorOrder: ['bill'],
                contributorsById: { bill: { id: 'bill', name: 'Bill Eberle' } },
              },
            },
          },
        },
      },
    },
  };
}

function blocks(contents: RulebookContentsDraftV1) {
  const { TABL: table, CRED: credits } = contents.pagesById.PAGE!.blocksById;
  if (table?.kind !== 'reference-table' || credits?.kind !== 'credits') {
    throw new Error('Expected reference matter');
  }
  return { table, credits };
}

describe('Rulebook Reference table and Credits contracts', () => {
  test('exposes every collection a Block owns and locates any item by its Block-unique ID', () => {
    const { table, credits } = blocks(referenceMatter());
    expect(rulebookItemCollections(table).map(({ collection, order }) => [collection, order])).toEqual([
      ['columns', ['faction', 'revival']],
      ['rows', ['atreides']],
    ]);
    expect(
      rulebookItemCollections(credits).map(({ collection, ownerItemId, order }) => [collection, ownerItemId, order])
    ).toEqual([
      ['groups', undefined, ['design']],
      ['contributors', 'design', ['bill']],
    ]);
    expect(findRulebookItem(credits, 'bill')).toMatchObject({
      collection: { collection: 'contributors', ownerItemId: 'design' },
      item: { name: 'Bill Eberle' },
    });
    expect(findRulebookItem(table, 'missing')).toBeUndefined();
  });

  test('refuses an item ID shared between a Block’s collections and a cell outside its columns', () => {
    const shared = referenceMatter();
    blocks(shared).table.rowOrder = ['faction'];
    blocks(shared).table.rowsById = { faction: { id: 'faction', cellsByColumnId: {} } };
    expect(rulebookContentsV1Schema.safeParse(shared).success).toBe(false);

    const orphanCell = referenceMatter();
    blocks(orphanCell).table.rowsById.atreides!.cellsByColumnId.sector = 'Nowhere';
    expect(rulebookContentsV1Schema.safeParse(orphanCell).success).toBe(false);

    const nestedDuplicate = referenceMatter();
    blocks(nestedDuplicate).credits.groupsById.design!.contributorsById.design = { id: 'design', name: 'Twice' };
    blocks(nestedDuplicate).credits.groupsById.design!.contributorOrder.push('design');
    expect(rulebookContentsV1Schema.safeParse(nestedDuplicate).success).toBe(false);

    expect(rulebookContentsV1Schema.safeParse(referenceMatter()).success).toBe(true);
  });

  test('accepts each new item shape as an editor entity and reads a stored table under the Edition contract', () => {
    const item = rulebookDraftEntitySchemas.item;
    expect(item.safeParse({ id: 'faction', label: 'Faction' }).success).toBe(true);
    expect(item.safeParse({ id: 'atreides', cellsByColumnId: { faction: 'Atreides' } }).success).toBe(true);
    expect(item.safeParse({ id: 'bill', name: 'Bill Eberle', role: 'Design' }).success).toBe(true);
    expect(
      item.safeParse({ id: 'design', heading: 'Game design', contributorOrder: [], contributorsById: {} }).success
    ).toBe(true);
    expect(item.safeParse({ id: 'loose', heading: 'No collection' }).success).toBe(false);

    const stored = referenceMatter();
    blocks(stored).table.rowsById.atreides!.cellsByColumnId.faction = 'Atreides  ';
    expect(rulebookContentsV1Schema.safeParse(stored).success).toBe(false);
    expect(rulebookEditionContentsV1Schema.safeParse(stored).success).toBe(true);
  });
});
