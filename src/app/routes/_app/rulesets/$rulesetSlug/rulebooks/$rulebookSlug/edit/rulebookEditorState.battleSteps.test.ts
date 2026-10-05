import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import { draftBlock, replaceDraft } from './rulebookEditorState.fixtures';

function initialRevision() {
  const side = { role: '', revealed: false, dial: 0, spice: 0, cards: [], troops: [] };
  return {
    revision: 'revision-1',
    contents: rulebookContentsV1Schema.parse({
      schemaVersion: 1,
      pageOrder: ['BTLE'],
      pagesById: {
        BTLE: {
          id: 'BTLE',
          anchor: 'battle',
          title: 'Battle',
          layoutId: 'sequence',
          showHeading: true,
          controlValues: {},
          blockOrderByRegion: { content: ['STEP'] },
          blocksById: {
            STEP: {
              id: 'STEP',
              kind: 'battle-step',
              step: '3',
              title: 'Prescience',
              caption: 'Ask about one element.',
              left: side,
              right: { ...side, role: 'Defender' },
            },
          },
        },
      },
    }),
  };
}

describe('Battle step reconciliation', () => {
  it('keeps changes to opposing plans and the explanation when a newer draft arrives', () => {
    const initial = initialRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        const step = draftBlock(draft, 'BTLE', 'STEP', 'battle-step');
        step.left = {
          ...step.left,
          revealed: true,
          dial: 3,
          spice: 2,
          leader: { kind: 'faction-member', factionId: 'atreides', memberId: '01f1cf94-2df1-4b96-9fbf-dd757afef27b' },
          cards: [{ kind: 'asset', assetId: 'maula-pistol' }],
        };
        step.dialogue = [{ speaker: 'left', text: 'What weapon are you using?' }];
        step.showSideLabels = false;
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    const savedStep = draftBlock(latest.contents, 'BTLE', 'STEP', 'battle-step');
    savedStep.right = { ...savedStep.right, dial: 4, spice: 4, knownCard: { kind: 'asset', assetId: 'gom-jabbar' } };
    savedStep.caption = 'The chosen element must remain in the battle plan.';
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    if (result.status !== 'ready') {
      throw new Error('Expected a ready editor');
    }
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(result.saveCandidate?.pagesById.BTLE?.blocksById.STEP).toMatchObject({
      caption: savedStep.caption,
      left: { revealed: true, dial: 3, spice: 2, cards: [{ kind: 'asset', assetId: 'maula-pistol' }] },
      right: { dial: 4, spice: 4, knownCard: { kind: 'asset', assetId: 'gom-jabbar' } },
      dialogue: [{ speaker: 'left', text: 'What weapon are you using?' }],
      showSideLabels: false,
    });
  });

  it('asks for a choice when two authors change the same battle plan', () => {
    const initial = initialRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        draftBlock(draft, 'BTLE', 'STEP', 'battle-step').right.dial = 3;
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    draftBlock(latest.contents, 'BTLE', 'STEP', 'battle-step').right.dial = 5;
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    if (result.status !== 'ready') {
      throw new Error('Expected a ready editor');
    }
    expect(result.incompatibilities).toMatchObject([{ kind: 'field', field: 'battle-right' }]);
    expect(result.canSave).toBe(false);
  });
});
