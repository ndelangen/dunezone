// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookBlockDraft } from '../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../src/shared/rulebooks/projectRenderDocument';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function referenceBlockFixture() {
  const fixture = await rulebookFixture();
  const { owner, ids } = fixture;
  const created = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Reference matter',
    source: { kind: 'starter' },
  });
  const blocks: RulebookBlockDraft[] = [
    {
      id: 'TABL',
      kind: 'reference-table',
      columnOrder: ['faction', 'revival'],
      columnsById: {
        faction: { id: 'faction', label: 'Faction' },
        revival: { id: 'revival', label: 'Free revival' },
      },
      rowOrder: ['fremen', 'atreides'],
      rowsById: {
        atreides: { id: 'atreides', cellsByColumnId: { faction: 'Atreides', revival: '2 forces' } },
        fremen: { id: 'fremen', cellsByColumnId: { faction: 'Fremen' } },
      },
      note: 'Revival happens after *every* battle.',
    },
    {
      id: 'CRED',
      kind: 'credits',
      groupOrder: ['design'],
      groupsById: {
        design: {
          id: 'design',
          heading: 'Game design',
          contributorOrder: ['jack', 'bill'],
          contributorsById: {
            bill: { id: 'bill', name: 'Bill Eberle' },
            jack: { id: 'jack', name: 'Jack Kittredge', role: 'Rules' },
          },
        },
      },
    },
    { id: 'EMPT', kind: 'reference-table', columnOrder: [], columnsById: {}, rowOrder: [], rowsById: {}, note: '' },
    { id: 'BARE', kind: 'credits', groupOrder: [], groupsById: {} },
  ];
  const contents = rulebookContentsV1Schema.parse({
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
        blockOrderByRegion: { content: blocks.map(({ id }) => id) },
        blocksById: Object.fromEntries(blocks.map((block) => [block.id, block])),
      },
    },
  });
  return {
    ...fixture,
    created,
    contents,
    locator: { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug },
  };
}

describe('Rulebook Reference table and Credits persistence and publication', () => {
  test('publishes filled and empty tables and credits through the reader, HTML and PDF projections', async () => {
    const fixture = await referenceBlockFixture();
    const { t, owner, created, contents, locator } = fixture;
    for (const work of await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' })) {
      await t.mutation(internal.rulebookEditionArtifactWork.complete, {
        artifactKind: 'html',
        artifactId: work.artifactId,
      });
    }
    for (const work of await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' })) {
      await t.mutation(internal.rulebookEditionArtifactWork.complete, {
        artifactKind: 'pdf',
        artifactId: work.artifactId,
      });
    }
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
    expect(
      await owner.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        confirmed: true,
      })
    ).toMatchObject({ kind: 'published' });
    const reader = await t.query(api.rulebooks.readerPage, locator);
    if (!reader) {
      throw new Error('Expected the published reader');
    }
    expect(reader.edition.contents).toEqual(contents);
    const [html, pdf] = await Promise.all([
      t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' }),
      t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' }),
    ]);
    const documents = [
      projectRulebookRenderDocument(reader.edition.contents, reader.assetsById, reader.edition.settings),
      html.find((work) => work.rulebookId === created.rulebook._id && work.editionNumber === 2)?.document,
      pdf.find((work) => work.rulebookId === created.rulebook._id && work.editionNumber === 2)?.document,
    ];
    for (const document of documents) {
      expect(document?.pagesById.PAGE.regions[0]?.blocks).toEqual([
        {
          id: 'TABL',
          kind: 'reference-table',
          columns: [
            { id: 'faction', label: 'Faction' },
            { id: 'revival', label: 'Free revival' },
          ],
          rows: [
            {
              id: 'fremen',
              cells: [
                { columnId: 'faction', text: 'Fremen' },
                { columnId: 'revival', text: '' },
              ],
            },
            {
              id: 'atreides',
              cells: [
                { columnId: 'faction', text: 'Atreides' },
                { columnId: 'revival', text: '2 forces' },
              ],
            },
          ],
          note: 'Revival happens after *every* battle.',
        },
        {
          id: 'CRED',
          kind: 'credits',
          groups: [
            {
              id: 'design',
              heading: 'Game design',
              contributors: [
                { id: 'jack', name: 'Jack Kittredge', role: 'Rules' },
                { id: 'bill', name: 'Bill Eberle' },
              ],
            },
          ],
        },
        { id: 'EMPT', kind: 'reference-table', columns: [], rows: [], note: '' },
        { id: 'BARE', kind: 'credits', groups: [] },
      ]);
    }
  });

  test('refuses a cell that names a column the table does not have', async () => {
    const fixture = await referenceBlockFixture();
    const { owner, created, contents } = fixture;
    const table = contents.pagesById.PAGE.blocksById.TABL;
    if (table.kind !== 'reference-table') {
      throw new Error('Expected the table');
    }
    table.rowsById.atreides!.cellsByColumnId.sector = 'Unplaced' as typeof table.note;
    await expect(
      owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents })
    ).rejects.toThrow();
  });

  test('clones columns, rows, groups and contributors with fresh identities while cells and contributors follow them', async () => {
    const fixture = await referenceBlockFixture();
    const { owner, ids, created, contents } = fixture;
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
    const cloned = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Cloned reference matter',
      source: { kind: 'clone', rulebook_id: created.rulebook._id },
    });
    const clone = rulebookContentsV1Schema.parse(cloned.draft.contents);
    const page = clone.pagesById[clone.pageOrder[0]!];
    const table = Object.values(page.blocksById).find((block) => block.kind === 'reference-table' && block.note);
    const credits = Object.values(page.blocksById).find((block) => block.kind === 'credits' && block.groupOrder.length);
    if (table?.kind !== 'reference-table' || credits?.kind !== 'credits') {
      throw new Error('Expected the cloned reference Blocks');
    }
    const sourceIds = new Set(['faction', 'revival', 'fremen', 'atreides', 'design', 'jack', 'bill']);
    const [factionId, revivalId] = table.columnOrder;
    const [fremenId, atreidesId] = table.rowOrder;
    expect([...table.columnOrder, ...table.rowOrder].some((id) => sourceIds.has(id))).toBe(false);
    expect(table.columnsById).toEqual({
      [factionId!]: { id: factionId, label: 'Faction' },
      [revivalId!]: { id: revivalId, label: 'Free revival' },
    });
    expect(table.rowsById).toEqual({
      [fremenId!]: { id: fremenId, cellsByColumnId: { [factionId!]: 'Fremen' } },
      [atreidesId!]: { id: atreidesId, cellsByColumnId: { [factionId!]: 'Atreides', [revivalId!]: '2 forces' } },
    });
    const [designId] = credits.groupOrder;
    const group = credits.groupsById[designId!]!;
    const [jackId, billId] = group.contributorOrder;
    expect([designId, jackId, billId].some((id) => sourceIds.has(id!))).toBe(false);
    expect(group).toEqual({
      id: designId,
      heading: 'Game design',
      contributorOrder: [jackId, billId],
      contributorsById: {
        [jackId!]: { id: jackId, name: 'Jack Kittredge', role: 'Rules' },
        [billId!]: { id: billId, name: 'Bill Eberle' },
      },
    });
  });
});
