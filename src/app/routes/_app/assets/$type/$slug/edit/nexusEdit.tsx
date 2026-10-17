import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';

import type { AssetPublicPage } from '@app/db/assets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { NexusCardEditor, nexusDraftWarnings } from '@app/widgets/card-editor/NexusCardEditor';
import type { NexusChapter, NexusDraft } from '@app/widgets/card-editor/NexusCardEditor';
import { NexusCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { nexusDraftStatus, openingNexusState, reduceNexusDraft } from '../../nexusAuthoring';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

/** The nexus card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-nexus`. */
export function NexusEditPage({ slug, loaderData }: Readonly<{ slug: string; loaderData: AssetPublicPage }>) {
  return (
    <CardEditGate
      type="card-nexus"
      schemaName="nexus card"
      schema={NexusCardAssetInput}
      slug={slug}
      loaderData={loaderData}
      session={renderEditSession}
    />
  );
}

function renderEditSession(props: Readonly<CardEditSessionProps<NexusDraft>>) {
  return <CardEditSession {...props} />;
}

function CardEditSession({ frontPresets, asset, initialDraft, access }: Readonly<CardEditSessionProps<NexusDraft>>) {
  const saving = useCardSave('card-nexus', asset);
  const [chapter, setChapter] = useState<NexusChapter>('head');
  const [state, dispatch] = useReducer(reduceNexusDraft, undefined, () =>
    openingNexusState(initialDraft, initialDraft)
  );
  const patch = (update: Partial<NexusDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const header = useEditPageHeader({
    warnings: [...nexusDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { isDirty, invalid, payload } = nexusDraftStatus(state);
  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };

  return (
    <CardEditFrame
      type="card-nexus"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: NexusCardAssetInput,
        /* The edited card keeps its name, so loading never moves it to another address. */
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data: { ...data, name: state.data.name } });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      <NexusCardEditor
        frontStyle={cardFrontStyleFor('card-nexus', state.data, frontPresets)}
        nameField={nameField}
        draft={state.data}
        patch={patch}
        memory={state.memory}
        remember={(update) => dispatch({ kind: 'remember', update })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
      />
    </CardEditFrame>
  );
}
