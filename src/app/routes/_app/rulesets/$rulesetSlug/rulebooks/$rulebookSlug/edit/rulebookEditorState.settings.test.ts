import { describe, expect, test } from 'vite-plus/test';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';
import { createCleanSavedRevision } from './rulebookEditorState.fixtures';

function ready(result: RulebookEditorResult) {
  if (result.status !== 'ready') {
    throw new Error('Expected ready editor');
  }
  return result;
}
const core = { size: 'gf9-core', design: 'illustrated' } as const;
const expansion = { size: 'gf9-expansion', design: 'illustrated' } as const;

describe('Rulebook authored settings', () => {
  test('Reset after raw Contents replacement restores the complete saved pair', () => {
    const initial = createCleanSavedRevision();
    const manager = createRulebookEditorStateManager(initial);
    const next = structuredClone(initial.contents);
    const page = next.pagesById[next.pageOrder[0]];
    if (page.layoutId !== 'single-column') {
      throw new Error('Expected a single-column first Page.');
    }
    page.blocksById = { RAWW: { id: 'RAWW', kind: 'referenced-illustration', caption: 'Raw replacement' } };
    page.blockOrderByRegion = { content: ['RAWW'] };
    expect(ready(manager.dispatch({ kind: 'replace-draft', draft: next, settings: core })).hasLocalChanges).toBe(true);
    const reset = ready(manager.dispatch({ kind: 'discard-draft' }));
    expect(reset.draft).toEqual(initial.contents);
    expect(reset.hasLocalChanges).toBe(false);
    expect(reset.canSave).toBe(false);
  });

  test('discard refuses an in-flight Save and later resets to its acknowledged saved pair', () => {
    const initial = createCleanSavedRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'replace-settings', settings: core });
    manager.dispatch({ kind: 'begin-save' });
    const refused = ready(manager.dispatch({ kind: 'discard-draft' }));
    expect(refused.isSaving).toBe(true);
    expect(refused.settings).toEqual(core);
    expect(refused.operationError).toContain('Wait for Save');
    manager.dispatch({ kind: 'save-succeeded', saved: { ...initial, revision: '2', settings: core } });
    manager.dispatch({ kind: 'replace-settings', settings: expansion });
    const reset = ready(manager.dispatch({ kind: 'discard-draft' }));
    expect(reset.settings).toEqual(core);
    expect(reset.latest.revision).toBe('2');
    expect(reset.hasLocalChanges).toBe(false);
    expect(reset.canSave).toBe(false);
  });

  test('settings-only edits enable Save and preserve an edit made while Save is in flight', () => {
    const initial = createCleanSavedRevision();
    const manager = createRulebookEditorStateManager(initial);
    const edited = ready(manager.dispatch({ kind: 'replace-settings', settings: core }));
    expect(edited.hasLocalChanges).toBe(true);
    expect(edited.canSave).toBe(true);
    const saving = ready(manager.dispatch({ kind: 'begin-save' }));
    expect(saving.saveRequest).toMatchObject({ settings: core, contents: initial.contents });
    manager.dispatch({ kind: 'replace-settings', settings: expansion });
    const acknowledged = ready(
      manager.dispatch({ kind: 'save-succeeded', saved: { ...initial, revision: '2', settings: core } })
    );
    expect(acknowledged.settings).toEqual(expansion);
    expect(acknowledged.settingsConflict).toBe(false);
    expect(acknowledged.saveRequest).toMatchObject({ expectedRevision: '2', settings: expansion });
    manager.dispatch({ kind: 'begin-save' });
    const done = ready(
      manager.dispatch({ kind: 'save-succeeded', saved: { ...initial, revision: '3', settings: expansion } })
    );
    expect(done.hasLocalChanges).toBe(false);
    expect(done.canSave).toBe(false);
  });

  test('rebases remote settings into a clean editor and requires a choice for concurrent settings edits', () => {
    const initial = createCleanSavedRevision();
    const manager = createRulebookEditorStateManager(initial);
    expect(
      ready(manager.dispatch({ kind: 'receive-latest', latest: { ...initial, revision: '2', settings: core } }))
        .settings
    ).toEqual(core);
    manager.dispatch({ kind: 'replace-settings', settings: expansion });
    const remote = { ...initial, revision: '3', settings: { ...core, design: 'restrained' as const } };
    const conflict = ready(manager.dispatch({ kind: 'save-stale', latest: remote }));
    expect(conflict.settings).toEqual(expansion);
    expect(conflict.settingsConflict).toBe(true);
    expect(conflict.canSave).toBe(false);
    const kept = ready(manager.dispatch({ kind: 'resolve-settings', choice: 'local' }));
    expect(kept.settingsConflict).toBe(false);
    expect(kept.saveRequest).toMatchObject({ expectedRevision: '3', settings: expansion });
    const reset = ready(manager.dispatch({ kind: 'replace-draft', draft: remote.contents, settings: remote.settings }));
    expect(reset.settings).toEqual(remote.settings);
    expect(reset.hasLocalChanges).toBe(false);
  });
});
