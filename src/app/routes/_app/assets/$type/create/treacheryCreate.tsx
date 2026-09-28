import { useReducer, useState } from 'react';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_TREACHERY_DRAFT,
  INITIAL_TREACHERY_MEMORY,
  TreacheryCardEditor,
  treacheryDraftWarnings,
} from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter, TreacheryDraft, TreacheryMemory } from '@app/widgets/card-editor/TreacheryCardEditor';
import { TreacheryAsset } from '@game/data/objects';

import { useAssetNameField } from '../../assetEditorStates';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design, because the generic version cost more than the duplication it removed.
 * `memory` is what the session needs and the stored card has no room for (D3), and `baseline` is what a reset returns to.
 */
type TreacheryState = { data: TreacheryDraft; memory: TreacheryMemory; baseline: TreacheryDraft };

type TreacheryEvent =
  | { kind: 'patch'; update: Partial<TreacheryDraft> }
  | { kind: 'remember'; update: Partial<TreacheryMemory> }
  | { kind: 'replace'; data: TreacheryDraft }
  | { kind: 'saved'; data: TreacheryDraft };

function openingState(data: TreacheryDraft, baseline: TreacheryDraft): TreacheryState {
  return { data, memory: INITIAL_TREACHERY_MEMORY, baseline };
}

function reduce(state: TreacheryState, event: TreacheryEvent): TreacheryState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets. */
    case 'replace':
      return openingState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

/** The treachery card create page. Mounted by the generic `$type/create` route when the type is `card-treachery`. */
export function TreacheryCreatePage() {
  const saving = useCardCreate('card-treachery');
  const [chapter, setChapter] = useState<TreacheryChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_TREACHERY_DRAFT, INITIAL_TREACHERY_DRAFT)
  );
  const patch = (update: Partial<TreacheryDraft>) => dispatch({ kind: 'patch', update });
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    type: 'card-treachery',
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Head',
    chapter: 'head' as TreacheryChapter,
  });
  const header = useEditPageHeader({
    warnings: [...treacheryDraftWarnings(state.data), ...conflictWarnings],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const payload = postedPayload(TreacheryAsset, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardCreateFrame
      type="card-treachery"
      title="New treachery card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      <TreacheryCardEditor
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
