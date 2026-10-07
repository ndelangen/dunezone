import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager, rulebookFieldResolution } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';
import { createCleanSavedRevision, draftBlock, replaceDraft } from './rulebookEditorState.fixtures';

const stormIcon = '/vector/icon/storrm_standalone.svg';
const combatIcon = '/vector/icon/combat.svg';

function ready(result: RulebookEditorResult) {
  if (result.status !== 'ready') {
    throw new Error(result.message);
  }
  return result;
}

function listIcon(result: RulebookEditorResult) {
  return draftBlock(ready(result).draft, 'RULE', 'L5ST', 'list').itemsById['item-example']!.icon;
}

describe('Rulebook list item icons', () => {
  it('saves and clears an existing item icon without another field edit', () => {
    const manager = createRulebookEditorStateManager(createCleanSavedRevision());
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        draftBlock(draft, 'RULE', 'L5ST', 'list').itemsById['item-example']!.icon = stormIcon;
      })
    );
    expect(ready(manager.result).canSave).toBe(true);
    const saving = ready(manager.dispatch({ kind: 'begin-save' }));
    const saved = { revision: 'revision-2', contents: saving.saveRequest!.contents };
    expect(saved.contents.pagesById.RULE!.blocksById.L5ST).toMatchObject({
      itemsById: { 'item-example': { icon: stormIcon } },
    });
    manager.dispatch({ kind: 'save-succeeded', saved });
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        draftBlock(draft, 'RULE', 'L5ST', 'list').itemsById['item-example']!.icon = undefined;
      })
    );
    expect(ready(manager.result).canSave).toBe(true);
    const cleared = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!.contents;
    manager.dispatch({ kind: 'save-succeeded', saved: { revision: 'revision-3', contents: cleared } });
    expect(listIcon(manager.result)).toBeUndefined();
    expect(ready(manager.result).canSave).toBe(false);
  });

  it('keeps a local icon when a collaborator changes another field on the item', () => {
    const saved = createCleanSavedRevision();
    const manager = createRulebookEditorStateManager(saved);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        draftBlock(draft, 'RULE', 'L5ST', 'list').itemsById['item-example']!.icon = stormIcon;
      })
    );
    const contents = structuredClone(saved.contents);
    const list = contents.pagesById.RULE!.blocksById.L5ST!;
    if (list.kind !== 'list') {
      throw new Error('Expected a list');
    }
    list.itemsById['item-example']!.name = 'A collaborator names this step';
    manager.dispatch({ kind: 'receive-latest', latest: { revision: 'revision-2', contents } });
    expect(listIcon(manager.result)).toBe(stormIcon);
    const result = ready(manager.result);
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(result.saveRequest!.contents.pagesById.RULE!.blocksById.L5ST).toMatchObject({
      itemsById: { 'item-example': { icon: stormIcon, name: 'A collaborator names this step' } },
    });
  });

  it('requires a choice when two authors select different icons for the same item', () => {
    const saved = createCleanSavedRevision();
    const manager = createRulebookEditorStateManager(saved);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        draftBlock(draft, 'RULE', 'L5ST', 'list').itemsById['item-example']!.icon = stormIcon;
      })
    );
    const contents = structuredClone(saved.contents);
    const list = contents.pagesById.RULE!.blocksById.L5ST!;
    if (list.kind !== 'list') {
      throw new Error('Expected a list');
    }
    list.itemsById['item-example']!.icon = combatIcon;
    manager.dispatch({ kind: 'receive-latest', latest: { revision: 'revision-2', contents } });
    const conflicted = ready(manager.result);
    expect(conflicted.canSave).toBe(false);
    expect(conflicted.incompatibilities).toHaveLength(1);
    const difference = conflicted.incompatibilities[0]!;
    if (difference.kind !== 'field') {
      throw new Error('Expected an icon field conflict');
    }
    expect(difference.field).toBe('icon');
    manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: difference.id,
        dependencyFingerprint: difference.dependencyFingerprint,
        outcome: rulebookFieldResolution(difference, stormIcon),
      },
    });
    expect(ready(manager.result).canSave).toBe(true);
    expect(listIcon(manager.result)).toBe(stormIcon);
  });
});
