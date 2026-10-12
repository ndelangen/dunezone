import { useReducer, useState } from 'react';

import type { AssetPublicPage } from '@app/db/assets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { StrongholdCardEditor, strongholdDraftWarnings } from '@app/widgets/card-editor/StrongholdCardEditor';
import type { StrongholdChapter, StrongholdDraft } from '@app/widgets/card-editor/StrongholdCardEditor';
import { StrongholdCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import {
  editedStronghold,
  replacedStronghold,
  savedStronghold,
  strongholdEditingStatus,
} from '../../../strongholdEditingSession';
import type { StrongholdEditingState, StrongholdEditingEvent } from '../../../strongholdEditingSession';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

export function StrongholdEditPage({ slug, loaderData }: Readonly<{ slug: string; loaderData: AssetPublicPage }>) {
  return (
    <CardEditGate
      type="card-stronghold"
      schemaName="stronghold card"
      schema={StrongholdCardAssetInput}
      slug={slug}
      loaderData={loaderData}
      session={renderStrongholdSession}
    />
  );
}

function renderStrongholdSession(props: CardEditSessionProps<StrongholdDraft>) {
  return <CardEditSession {...props} />;
}

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

function CardEditSession({ asset, initialDraft, access }: Readonly<CardEditSessionProps<StrongholdDraft>>) {
  const saving = useCardSave('card-stronghold', asset);
  const [chapter, setChapter] = useState<StrongholdChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () => ({ data: initialDraft, baseline: initialDraft }));
  const patch = (update: Partial<StrongholdDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const header = useEditPageHeader({
    warnings: [...strongholdDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { payload, invalid, isDirty } = strongholdEditingStatus(state);

  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };

  return (
    <CardEditFrame
      type="card-stronghold"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
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
    </CardEditFrame>
  );
}
