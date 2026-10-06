import { useReducer, useState } from 'react';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_CUSTOM_CARD_DRAFT,
  INITIAL_CUSTOM_CARD_MEMORY,
  CustomCardEditor,
  customCardDraftWarnings,
} from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter, CustomCardDraft, CustomCardMemory } from '@app/widgets/card-editor/CustomCardEditor';
import { CustomCardAssetInput } from '@game/data/objects';

import { useAssetNameField } from '../../assetEditorStates';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

type CustomCardState = { data: CustomCardDraft; memory: CustomCardMemory; baseline: CustomCardDraft };

type CustomCardEvent =
  | { kind: 'patch'; update: Partial<CustomCardDraft> }
  | { kind: 'remember'; update: Partial<CustomCardMemory> }
  | { kind: 'replace'; data: CustomCardDraft }
  | { kind: 'saved'; data: CustomCardDraft };

function openingState(data: CustomCardDraft, baseline: CustomCardDraft): CustomCardState {
  return { data, memory: INITIAL_CUSTOM_CARD_MEMORY, baseline };
}

function reduce(state: CustomCardState, event: CustomCardEvent): CustomCardState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    case 'replace':
      return openingState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

export function CustomCreatePage() {
  const saving = useCardCreate('card-custom');
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_CUSTOM_CARD_DRAFT, INITIAL_CUSTOM_CARD_DRAFT)
  );
  const patch = (update: Partial<CustomCardDraft>) => dispatch({ kind: 'patch', update });
  const { nameField, conflictWarnings } = useAssetNameField({
    canRename: true,
    type: 'card-custom',
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Head',
    chapter: 'head' as CustomCardChapter,
  });
  const header = useEditPageHeader({
    warnings: [...customCardDraftWarnings(state.data), ...conflictWarnings],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    const payload = postedPayload(CustomCardAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardCreateFrame
      type="card-custom"
      title="New custom card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      <CustomCardEditor
        nameField={nameField}
        draft={state.data}
        patch={patch}
        memory={state.memory}
        remember={(update) => dispatch({ kind: 'remember', update })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
      />
    </CardCreateFrame>
  );
}
