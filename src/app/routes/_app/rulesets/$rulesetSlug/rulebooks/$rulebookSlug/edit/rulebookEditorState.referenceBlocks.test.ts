import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';
import { createCleanRulebookEditorInput } from './rulebookEditorState.fixtures';

function ready(result: RulebookEditorResult) {
  if (result.status !== 'ready') {
    throw new Error('Expected a ready editor');
  }
  return result;
}
function table(contents: RulebookContentsDraftV1) {
  const block = contents.pagesById.REFS!.blocksById.TABL!;
  if (block.kind !== 'reference-table') {
    throw new Error('Expected a Reference table');
  }
  return block;
}
function credits(contents: RulebookContentsDraftV1) {
  const block = contents.pagesById.REFS!.blocksById.CRED!;
  if (block.kind !== 'credits') {
    throw new Error('Expected Credits');
  }
  return block;
}
function input() {
  const clean = createCleanRulebookEditorInput();
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['REFS'],
    pagesById: {
      REFS: {
        id: 'REFS',
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
            rowOrder: ['atreides', 'fremen'],
            rowsById: {
              atreides: { id: 'atreides', cellsByColumnId: { faction: 'Atreides', revival: '2 forces' } },
              fremen: { id: 'fremen', cellsByColumnId: { faction: 'Fremen', revival: '3 forces' } },
            },
            note: 'Revival happens after battle.',
          },
          CRED: {
            id: 'CRED',
            kind: 'credits',
            groupOrder: ['design', 'study'],
            groupsById: {
              design: {
                id: 'design',
                heading: 'Game design',
                contributorOrder: ['bill', 'jack'],
                contributorsById: {
                  bill: { id: 'bill', name: 'Bill Eberle' },
                  jack: { id: 'jack', name: 'Jack Kittredge', role: 'Rules' },
                },
              },
              study: {
                id: 'study',
                heading: 'Pattern study',
                contributorOrder: ['zone'],
                contributorsById: { zone: { id: 'zone', name: 'Dune Zone' } },
              },
            },
          },
        },
      },
    },
  });
  return {
    ...clean,
    baseline: { ...clean.baseline, contents },
    latest: { ...clean.latest, contents: structuredClone(contents) },
  };
}
function latestRevision(initial: ReturnType<typeof input>, amend: (contents: RulebookContentsDraftV1) => void) {
  const latest = structuredClone(initial.latest);
  latest.revision = 'revision-2';
  amend(latest.contents as RulebookContentsDraftV1);
  return latest;
}
const atreides = { kind: 'item', pageId: 'REFS', blockId: 'TABL', itemId: 'atreides' } as const;

describe('Reference table reconciliation', () => {
  it('carries cells with a reordered column and supplies blank cells to an added column', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    const draft = structuredClone(ready(manager.result).draft);
    table(draft).columnOrder = ['revival', 'faction', 'sector'];
    table(draft).columnsById.sector = { id: 'sector', label: 'Sector' };
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toBeUndefined();
    expect(result.rebasedPatch.creates).toEqual([
      {
        kind: 'create',
        entity: {
          kind: 'item',
          pageId: 'REFS',
          blockId: 'TABL',
          collection: 'columns',
          item: { id: 'sector', label: 'Sector' },
        },
        placement: {
          container: { kind: 'item-order', pageId: 'REFS', blockId: 'TABL', collection: 'columns' },
          afterId: 'faction',
          beforeId: null,
        },
      },
    ]);
    expect(result.rebasedPatch.sets).toEqual([]);
    expect(table(result.saveCandidate!)).toMatchObject({
      columnOrder: ['revival', 'faction', 'sector'],
      rowsById: {
        atreides: { cellsByColumnId: { faction: 'Atreides', revival: '2 forces' } },
        fremen: { cellsByColumnId: { faction: 'Fremen', revival: '3 forces' } },
      },
    });
  });

  it('removes only the deleted column and its cells', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    const draft = structuredClone(ready(manager.result).draft);
    table(draft).columnOrder = ['faction'];
    delete table(draft).columnsById.revival;
    for (const row of Object.values(table(draft).rowsById)) {
      delete row.cellsByColumnId.revival;
    }
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toBeUndefined();
    expect(result.rebasedPatch.deletes).toEqual([
      {
        kind: 'delete',
        root: { kind: 'item', pageId: 'REFS', blockId: 'TABL', itemId: 'revival' },
        deletedRefs: [{ kind: 'item', pageId: 'REFS', blockId: 'TABL', itemId: 'revival' }],
      },
    ]);
    expect(result.rebasedPatch.sets).toEqual([]);
    expect(table(result.saveCandidate!)).toMatchObject({
      columnOrder: ['faction'],
      rowsById: {
        atreides: { cellsByColumnId: { faction: 'Atreides' } },
        fremen: { cellsByColumnId: { faction: 'Fremen' } },
      },
    });
    expect(table(result.saveCandidate!).rowsById.atreides!.cellsByColumnId).not.toHaveProperty('revival');
  });

  it('merges concurrent edits to different cells of one row and to rows and columns', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'set', target: atreides, field: 'cell:faction', value: 'House Atreides' });
    const draft = structuredClone(ready(manager.result).draft);
    table(draft).rowOrder = ['fremen', 'atreides'];
    manager.dispatch({ kind: 'replace-draft', draft });
    const latest = latestRevision(initial, (contents) => {
      table(contents).rowsById.atreides!.cellsByColumnId.revival = '2 forces per turn';
      table(contents).columnsById.revival!.label = 'Free revival per turn';
      table(contents).note = 'Revival happens after every battle.';
    });
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.operationError).toBeUndefined();
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(table(result.saveCandidate!)).toMatchObject({
      rowOrder: ['fremen', 'atreides'],
      columnsById: { revival: { label: 'Free revival per turn' } },
      rowsById: { atreides: { cellsByColumnId: { faction: 'House Atreides', revival: '2 forces per turn' } } },
      note: 'Revival happens after every battle.',
    });
  });

  it('reviews a local cell edit whose column another author deleted, and restores the column with its cells', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'set', target: atreides, field: 'cell:revival', value: '2 forces, free' });
    const latest = latestRevision(initial, (contents) => {
      table(contents).columnOrder = ['faction'];
      delete table(contents).columnsById.revival;
      for (const row of Object.values(table(contents).rowsById)) {
        delete row.cellsByColumnId.revival;
      }
    });
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.canSave).toBe(false);
    const difference = result.incompatibilities.find((entry) => entry.kind === 'deletion');
    if (difference?.kind !== 'deletion') {
      throw new Error('Expected a deletion review');
    }
    expect(difference).toMatchObject({
      direction: 'saved-deletion',
      root: { kind: 'item', pageId: 'REFS', blockId: 'TABL', itemId: 'revival' },
    });
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: difference.id,
          dependencyFingerprint: difference.dependencyFingerprint,
          outcome: { kind: 'restore-local-subtree' },
        },
      })
    );
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    expect(table(result.saveCandidate!)).toMatchObject({
      columnOrder: ['faction', 'revival'],
      columnsById: { revival: { id: 'revival', label: 'Free revival' } },
      rowsById: {
        atreides: { cellsByColumnId: { faction: 'Atreides', revival: '2 forces, free' } },
        fremen: { cellsByColumnId: { faction: 'Fremen' } },
      },
    });
  });

  it('reviews a saved cell edit on a row deleted locally before the deletion can be saved', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'delete', root: atreides });
    const latest = latestRevision(initial, (contents) => {
      table(contents).rowsById.atreides!.cellsByColumnId.faction = 'House Atreides';
    });
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.canSave).toBe(false);
    expect(result.incompatibilities).toMatchObject([{ kind: 'deletion', direction: 'local-deletion', root: atreides }]);
  });
});

describe('Credits reconciliation', () => {
  it('keeps contributor identity through a group reorder and a concurrent role edit', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    const draft = structuredClone(ready(manager.result).draft);
    credits(draft).groupOrder = ['study', 'design'];
    credits(draft).groupsById.design!.contributorOrder = ['jack', 'bill'];
    credits(draft).groupsById.design!.contributorsById.bill!.name = 'William Eberle';
    manager.dispatch({ kind: 'replace-draft', draft });
    const latest = latestRevision(initial, (contents) => {
      credits(contents).groupsById.design!.contributorsById.bill!.role = 'Lead';
      credits(contents).groupsById.design!.heading = 'Original design';
    });
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.operationError).toBeUndefined();
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(credits(result.saveCandidate!)).toMatchObject({
      groupOrder: ['study', 'design'],
      groupsById: {
        design: {
          heading: 'Original design',
          contributorOrder: ['jack', 'bill'],
          contributorsById: { bill: { id: 'bill', name: 'William Eberle', role: 'Lead' } },
        },
      },
    });
  });

  it('deletes a group with its contributors as one reviewed closure and restores them together', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    const design = { kind: 'item', pageId: 'REFS', blockId: 'CRED', itemId: 'design' } as const;
    manager.dispatch({
      kind: 'set',
      target: { ...design, itemId: 'study' },
      field: 'heading',
      value: 'Pattern study, 2026',
    });
    let result = ready(manager.dispatch({ kind: 'delete', root: design }));
    expect(result.rebasedPatch.deletes).toEqual([
      {
        kind: 'delete',
        root: design,
        deletedRefs: [
          { kind: 'item', pageId: 'REFS', blockId: 'CRED', itemId: 'bill' },
          design,
          { kind: 'item', pageId: 'REFS', blockId: 'CRED', itemId: 'jack' },
        ],
      },
    ]);
    expect(credits(result.saveCandidate!).groupOrder).toEqual(['study']);

    const latest = latestRevision(initial, (contents) => {
      credits(contents).groupsById.design!.contributorsById.jack!.role = 'Rules editor';
    });
    result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    const difference = result.incompatibilities.find((entry) => entry.kind === 'deletion');
    if (difference?.kind !== 'deletion') {
      throw new Error('Expected a deletion review');
    }
    expect(difference.direction).toBe('local-deletion');
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: difference.id,
          dependencyFingerprint: difference.dependencyFingerprint,
          outcome: { kind: 'accept-latest-subtree' },
        },
      })
    );
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    expect(credits(result.saveCandidate!)).toMatchObject({
      groupOrder: ['design', 'study'],
      groupsById: {
        design: {
          contributorOrder: ['bill', 'jack'],
          contributorsById: { jack: { name: 'Jack Kittredge', role: 'Rules editor' } },
        },
        study: { heading: 'Pattern study, 2026' },
      },
    });
  });

  it('reviews a contributor added to a group another author deleted instead of dropping it', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    const draft = structuredClone(ready(manager.result).draft);
    credits(draft).groupsById.design!.contributorOrder.push('peter');
    credits(draft).groupsById.design!.contributorsById.peter = { id: 'peter', name: 'Peter Olotka' };
    let result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.rebasedPatch.creates).toEqual([
      {
        kind: 'create',
        entity: {
          kind: 'item',
          pageId: 'REFS',
          blockId: 'CRED',
          collection: 'contributors',
          ownerItemId: 'design',
          item: { id: 'peter', name: 'Peter Olotka' },
        },
        placement: {
          container: {
            kind: 'item-order',
            pageId: 'REFS',
            blockId: 'CRED',
            collection: 'contributors',
            ownerItemId: 'design',
          },
          afterId: 'jack',
          beforeId: null,
        },
      },
    ]);
    const latest = latestRevision(initial, (contents) => {
      credits(contents).groupOrder = ['study'];
      delete credits(contents).groupsById.design;
    });
    result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.canSave).toBe(false);
    expect(result.incompatibilities.length).toBeGreaterThan(0);
    expect(result.incompatibilities[0]).toMatchObject({ kind: 'deletion', direction: 'saved-deletion' });
  });
});
