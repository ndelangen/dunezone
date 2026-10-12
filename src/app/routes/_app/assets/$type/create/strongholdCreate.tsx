import { useReducer, useState } from 'react';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_STRONGHOLD_DRAFT,
  StrongholdCardEditor,
  strongholdDraftWarnings,
} from '@app/widgets/card-editor/StrongholdCardEditor';
import type { StrongholdChapter, StrongholdDraft } from '@app/widgets/card-editor/StrongholdCardEditor';
import { StrongholdCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../assetEditorStates';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

type StrongholdState = { data: StrongholdDraft; baseline: StrongholdDraft };

type StrongholdEvent =
  | { kind: 'patch'; update: Partial<StrongholdDraft> }
  | { kind: 'replace'; data: StrongholdDraft }
  | { kind: 'saved'; data: StrongholdDraft };

function openingState(data: StrongholdDraft, baseline: StrongholdDraft): StrongholdState {
  return { data, baseline };
}

function reduce(state: StrongholdState, event: StrongholdEvent): StrongholdState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'replace':
      return openingState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

export function StrongholdCreatePage() {
  const saving = useCardCreate('card-stronghold');
  const [chapter, setChapter] = useState<StrongholdChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_STRONGHOLD_DRAFT, INITIAL_STRONGHOLD_DRAFT)
  );
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
  const validation = StrongholdCardAssetInput.safeParse(state.data);
  const invalid = validation.success ? undefined : validation.error.issues[0]?.message;
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success) {
      return;
    }
    const payload = postedPayload(StrongholdCardAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardCreateFrame
      type="card-stronghold"
      title="New stronghold card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
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
