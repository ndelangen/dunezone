import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';

import type { AssetPublicPage } from '@app/db/assets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { HomeworldCardEditor, homeworldDraftWarnings } from '@app/widgets/card-editor/HomeworldCardEditor';
import type { HomeworldChapter, HomeworldDraft } from '@app/widgets/card-editor/HomeworldCardEditor';
import { HomeworldCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { homeworldDraftStatus, openingHomeworldState, reduceHomeworldDraft } from '../../homeworldAuthoring';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

/** The homeworld card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-homeworld`. */
export function HomeworldEditPage({ slug, loaderData }: Readonly<{ slug: string; loaderData: AssetPublicPage }>) {
  return (
    <CardEditGate
      type="card-homeworld"
      schemaName="homeworld card"
      schema={HomeworldCardAssetInput}
      slug={slug}
      loaderData={loaderData}
      session={renderEditSession}
    />
  );
}

function renderEditSession(props: Readonly<CardEditSessionProps<HomeworldDraft>>) {
  return <CardEditSession {...props} />;
}

function CardEditSession({
  frontPresets,
  asset,
  initialDraft,
  access,
}: Readonly<CardEditSessionProps<HomeworldDraft>>) {
  const saving = useCardSave('card-homeworld', asset);
  const [chapter, setChapter] = useState<HomeworldChapter>('head');
  const [state, dispatch] = useReducer(reduceHomeworldDraft, undefined, () =>
    openingHomeworldState(initialDraft, initialDraft)
  );
  const patch = (update: Partial<HomeworldDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
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
    <CardEditFrame
      type="card-homeworld"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{ schema: HomeworldCardAssetInput, header, dispatch, afterLoad: () => setChapter('head') }}
      saveError={saving.error}
    >
      <HomeworldCardEditor
        frontStyle={cardFrontStyleFor('card-homeworld', state.data, frontPresets)}
        nameField={nameField}
        draft={state.data}
        patch={patch}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
      />
    </CardEditFrame>
  );
}
