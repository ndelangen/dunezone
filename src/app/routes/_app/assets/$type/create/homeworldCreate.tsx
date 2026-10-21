import { newCardWithStandards } from '@shared/assets/cardFrontPresets';
import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { EMPTY_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { useReducer, useState } from 'react';

import { useCardFrontPresets } from '@db/cardFrontPresets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { HomeworldCardEditor, homeworldDraftWarnings } from '@app/widgets/card-editor/HomeworldCardEditor';
import type { HomeworldChapter, HomeworldDraft } from '@app/widgets/card-editor/HomeworldCardEditor';
import { HomeworldCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../assetEditorStates';
import { homeworldDraftStatus, openingHomeworldState, reduceHomeworldDraft } from '../homeworldAuthoring';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

/** The homeworld card create page. Mounted by the generic `$type/create` route when the type is `card-homeworld`. */
export function HomeworldCreatePage() {
  const frontPresets = useCardFrontPresets();
  const saving = useCardCreate('card-homeworld');
  const [chapter, setChapter] = useState<HomeworldChapter>('head');
  const [state, dispatch] = useReducer(reduceHomeworldDraft, undefined, () =>
    openingHomeworldState(
      newCardWithStandards('card-homeworld', EMPTY_HOMEWORLD_CARD),
      newCardWithStandards('card-homeworld', EMPTY_HOMEWORLD_CARD)
    )
  );
  const patch = (update: Partial<HomeworldDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ name }),
  });
  const header = useEditPageHeader({
    warnings: [...homeworldDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { isDirty, invalid, payload } = homeworldDraftStatus(state);
  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };

  return (
    <CardCreateFrame
      type="card-homeworld"
      title="New homeworld card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: HomeworldCardAssetInput,
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      <HomeworldCardEditor
        frontStyle={cardFrontStyleFor('card-homeworld', state.data, frontPresets ?? [])}
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
