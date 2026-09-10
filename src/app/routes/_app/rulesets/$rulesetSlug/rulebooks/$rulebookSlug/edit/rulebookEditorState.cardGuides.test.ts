import { normalizeFormattedText } from '@shared/formattedText';
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
function group(contents: RulebookContentsDraftV1) {
  const block = contents.pagesById.RULE!.blocksById.GRUP!;
  if (block.kind !== 'card-group') {
    throw new Error('Expected Card group');
  }
  return block;
}
function input() {
  const clean = createCleanRulebookEditorInput();
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['RULE'],
    pagesById: {
      RULE: {
        id: 'RULE',
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
            source: { kind: 'asset', assetId: 'lasgun' },
            text: 'Choose when to play it.',
            quantity: 1,
          },
          GRUP: {
            id: 'GRUP',
            kind: 'card-group',
            title: 'Weapons',
            text: 'Use a weapon in battle.',
            variant: 'featured-member',
            featuredItemId: 'first',
            itemOrder: ['first', 'second'],
            itemsById: {
              first: {
                id: 'first',
                source: { kind: 'asset', assetId: 'maula-pistol' },
                text: 'A projectile weapon.',
                quantity: 2,
              },
              second: { id: 'second', source: { kind: 'asset', assetId: 'crysknife' }, text: 'Another weapon.' },
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
const groupTarget = { kind: 'block', pageId: 'RULE', blockId: 'GRUP' } as const;
const firstTarget = { kind: 'item', pageId: 'RULE', blockId: 'GRUP', itemId: 'first' } as const;

describe('Card guide reconciliation', () => {
  it('saves Card identity and authored quantity independently from guidance', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    const target = { kind: 'block', pageId: 'RULE', blockId: 'CARD' } as const;
    manager.dispatch({ kind: 'set', target, field: 'source', value: { kind: 'asset', assetId: 'shield' } });
    manager.dispatch({ kind: 'set', target, field: 'quantity', value: 0 });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    const card = latest.contents.pagesById.RULE!.blocksById.CARD!;
    if (card.kind !== 'card-entry') {
      throw new Error('Expected Card entry');
    }
    const normalized = normalizeFormattedText('Updated guidance.');
    if (!normalized.ok) {
      throw new Error('Expected normalized text');
    }
    card.text = normalized.value;
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(result.saveCandidate!.pagesById.RULE!.blocksById.CARD).toMatchObject({
      source: { kind: 'asset', assetId: 'shield' },
      quantity: 0,
      text: 'Updated guidance.',
    });
  });

  it('keeps featured identity and member fields through concurrent reorder and guidance edits', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    const draft = structuredClone(ready(manager.result).draft);
    group(draft).itemOrder.reverse();
    group(draft).itemsById.first!.quantity = 4;
    group(draft).itemsById.first!.source = { kind: 'asset', assetId: 'replacement' };
    manager.dispatch({ kind: 'replace-draft', draft });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    group(latest.contents).itemsById.first!.text = 'Remote guidance.';
    group(latest.contents).text = 'Remote shared guidance.';
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.operationError).toBeUndefined();
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(group(result.saveCandidate!)).toMatchObject({
      itemOrder: ['second', 'first'],
      featuredItemId: 'first',
      text: 'Remote shared guidance.',
      itemsById: {
        first: { quantity: 4, source: { kind: 'asset', assetId: 'replacement' }, text: 'Remote guidance.' },
      },
    });
  });

  it('retains hidden featured choice when changing treatment and clears it when that member is deleted', () => {
    const manager = createRulebookEditorStateManager(input());
    manager.dispatch({ kind: 'set', target: groupTarget, field: 'variant', value: 'compact' });
    expect(group(ready(manager.result).draft).featuredItemId).toBe('first');
    const result = ready(manager.dispatch({ kind: 'delete', root: firstTarget }));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    expect(group(result.saveCandidate!)).toMatchObject({ itemOrder: ['second'], variant: 'compact' });
    expect(group(result.saveCandidate!).featuredItemId).toBeUndefined();
    expect(group(result.saveCandidate!).itemsById.second!.text).toBe('Another weapon.');
  });

  it('creates a populated group through the entity patch and keeps its featured member', () => {
    const manager = createRulebookEditorStateManager(input());
    const draft = structuredClone(ready(manager.result).draft);
    const next = structuredClone(group(draft));
    next.id = 'NEXT';
    draft.pagesById.RULE!.blocksById.NEXT = next;
    const page = draft.pagesById.RULE!;
    if (page.layoutId !== 'single-column') {
      throw new Error('Expected single column');
    }
    page.blockOrderByRegion.content.push('NEXT');
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    expect(result.saveCandidate!.pagesById.RULE!.blocksById.NEXT).toEqual(next);
  });

  it('keeps an empty group publishable and a cleared member reference editable', () => {
    const manager = createRulebookEditorStateManager(input());
    manager.dispatch({ kind: 'set', target: firstTarget, field: 'source', value: undefined });
    expect(group(ready(manager.result).draft).itemsById.first!.text).toBe('A projectile weapon.');
    manager.dispatch({ kind: 'delete', root: firstTarget });
    const result = ready(manager.dispatch({ kind: 'delete', root: { ...firstTarget, itemId: 'second' } }));
    expect(result.canSave).toBe(true);
    expect(group(result.saveCandidate!)).toMatchObject({
      itemOrder: [],
      itemsById: {},
      text: 'Use a weapon in battle.',
    });
    expect(group(result.saveCandidate!).featuredItemId).toBeUndefined();
  });
});
