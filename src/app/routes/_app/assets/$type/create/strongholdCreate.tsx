import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';

import { useCardFrontPresets } from '@db/cardFrontPresets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_STRONGHOLD_DRAFT,
  StrongholdCardEditor,
  strongholdDraftWarnings,
} from '@app/widgets/card-editor/StrongholdCardEditor';
import type { StrongholdChapter, StrongholdDraft } from '@app/widgets/card-editor/StrongholdCardEditor';
import { StrongholdCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../assetEditorStates';
import {
  editedStronghold,
  replacedStronghold,
  savedStronghold,
  strongholdEditingStatus,
} from '../../strongholdEditingSession';
import type { StrongholdEditingState, StrongholdEditingEvent } from '../../strongholdEditingSession';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

function reduce(state: StrongholdEditingState, event: StrongholdEditingEvent): StrongholdEditingState {
  switch (event.kind) {
    case 'patch':
      return editedStronghold(state, event.update);
    case 'replace':
      return replacedStronghold(state, event.data);
    case 'saved':
      return savedStronghold(state, event.data);
  }
}

export function StrongholdCreatePage() {
  const frontPresets = useCardFrontPresets();
  const saving = useCardCreate('card-stronghold');
  const [chapter, setChapter] = useState<StrongholdChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () => ({
    data: INITIAL_STRONGHOLD_DRAFT,
    baseline: INITIAL_STRONGHOLD_DRAFT,
  }));
  const patch = (update: Partial<StrongholdDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ name }),
  });
  const header = useEditPageHeader({
    warnings: [...strongholdDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { payload, invalid, isDirty } = strongholdEditingStatus(state);

  return (
    <CardCreateFrame
      type="card-stronghold"
      title="New stronghold card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={() => {
        if (payload) {
          saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
        }
      }}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: StrongholdCardAssetInput,
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      <StrongholdCardEditor
        frontStyle={cardFrontStyleFor('card-stronghold', state.data, frontPresets ?? [])}
        nameField={nameField}
        draft={state.data}
        patch={patch}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
      />
    </CardCreateFrame>
  );
}
