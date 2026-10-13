import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';

import { useCardFrontPresets } from '@db/cardFrontPresets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { INITIAL_NEXUS_DRAFT, NexusCardEditor, nexusDraftWarnings } from '@app/widgets/card-editor/NexusCardEditor';
import type { NexusChapter, NexusDraft } from '@app/widgets/card-editor/NexusCardEditor';
import { NexusCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../assetEditorStates';
import { nexusDraftStatus, openingNexusState, reduceNexusDraft } from '../nexusAuthoring';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

/** The nexus card create page. Mounted by the generic `$type/create` route when the type is `card-nexus`. */
export function NexusCreatePage() {
  const frontPresets = useCardFrontPresets();
  const saving = useCardCreate('card-nexus');
  const [chapter, setChapter] = useState<NexusChapter>('head');
  const [state, dispatch] = useReducer(reduceNexusDraft, undefined, () =>
    openingNexusState(INITIAL_NEXUS_DRAFT, INITIAL_NEXUS_DRAFT)
  );
  const patch = (update: Partial<NexusDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ name }),
  });
  const header = useEditPageHeader({
    warnings: [...nexusDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { isDirty, invalid, payload } = nexusDraftStatus(state, true);
  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };

  return (
    <CardCreateFrame
      type="card-nexus"
      title="New nexus card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: NexusCardAssetInput,
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      <NexusCardEditor
        frontStyle={cardFrontStyleFor('card-nexus', state.data, frontPresets ?? [])}
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
