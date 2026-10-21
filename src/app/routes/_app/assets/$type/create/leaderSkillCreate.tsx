import { newCardWithStandards } from '@shared/assets/cardFrontPresets';
import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';

import { useCardFrontPresets } from '@db/cardFrontPresets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_LEADER_SKILL_DRAFT,
  LeaderSkillCardEditor,
  leaderSkillDraftWarnings,
} from '@app/widgets/card-editor/LeaderSkillCardEditor';
import type {
  LeaderSkillChapter,
  LeaderSkillDraft,
  LeaderSkillMemory,
} from '@app/widgets/card-editor/LeaderSkillCardEditor';
import { LeaderSkillAssetInput } from '@game/data/objects';

import { assetNameField } from '../../assetEditorStates';
import { openingLeaderSkillState, reduceLeaderSkill, leaderSkillDraftStatus } from '../../leaderSkillEditingSession';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

/** The leader skill card create page, mounted by the generic asset create route. */
export function LeaderSkillCreatePage() {
  const frontPresets = useCardFrontPresets();
  const saving = useCardCreate('card-leaderability');
  const [state, dispatch] = useReducer(reduceLeaderSkill, undefined, () =>
    openingLeaderSkillState(
      newCardWithStandards('card-leaderability', INITIAL_LEADER_SKILL_DRAFT),
      newCardWithStandards('card-leaderability', INITIAL_LEADER_SKILL_DRAFT)
    )
  );
  const [chapter, setChapter] = useState<LeaderSkillChapter>('head');
  const [overflow, setOverflow] = useState(false);
  const patch = (update: Partial<LeaderSkillDraft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: leaderSkillDraftWarnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const status = leaderSkillDraftStatus(state, overflow);
  const save = () => {
    if (status.payload) {
      const data = status.payload;
      saving.save(data, () => dispatch({ kind: 'saved', data }));
    }
  };
  const nameField = assetNameField({
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ name }),
  });
  return (
    <CardCreateFrame
      type="card-leaderability"
      title="New leader skill card"
      headerSlot={header.slot}
      status={{
        isDirty: status.isDirty,
        isNameBlank: !state.data.name.trim(),
        saveState: saving.saveState,
        invalid: status.invalid,
      }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: LeaderSkillAssetInput,
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      <LeaderSkillCardEditor
        frontStyle={cardFrontStyleFor('card-leaderability', state.data, frontPresets ?? [])}
        nameField={nameField}
        draft={state.data}
        patch={patch}
        memory={state.memory}
        remember={(update: Partial<LeaderSkillMemory>) => dispatch({ kind: 'remember', update })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
        onOverflow={setOverflow}
      />
    </CardCreateFrame>
  );
}
