import { useReducer, useState } from 'react';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { INITIAL_SPICE_DRAFT, SpiceCardEditor, spiceDraftWarnings } from '@app/widgets/card-editor/SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';
import { SpiceAsset } from '@game/data/objects';

import { assetNameField } from '../../assetEditorStates';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

/**
 * This page's authoring state, and the three things that happen to it.
 * Written here rather than shared, as every editor's is (D7 on «Work the editors wave»).
 * A spice card has no background composer, so there is no session memory beside the draft.
 */
type SpiceState = { data: SpiceDraft; baseline: SpiceDraft };

type SpiceEvent =
  | { kind: 'patch'; update: Partial<SpiceDraft> }
  | { kind: 'replace'; data: SpiceDraft }
  | { kind: 'saved'; data: SpiceDraft };

function reduce(state: SpiceState, event: SpiceEvent): SpiceState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'replace':
      return { data: event.data, baseline: state.baseline };
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

/** The spice card create page. Mounted by the generic `$type/create` route when the type is `card-spice`. */
export function SpiceCreatePage() {
  const saving = useCardCreate('card-spice');
  const [chapter, setChapter] = useState<SpiceChapter>('head');
  const [state, dispatch] = useReducer(reduce, { data: INITIAL_SPICE_DRAFT, baseline: INITIAL_SPICE_DRAFT });
  const patch = (update: Partial<SpiceDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ name }),
  });
  const header = useEditPageHeader({
    warnings: [...spiceDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    const payload = postedPayload(SpiceAsset, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardCreateFrame
      type="card-spice"
      title="New spice card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: SpiceAsset,
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      <SpiceCardEditor
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
