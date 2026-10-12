import { useReducer, useState } from 'react';

import type { AssetPageData } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { StrongholdCardEditor, strongholdDraftWarnings } from '@app/widgets/card-editor/StrongholdCardEditor';
import type { StrongholdChapter, StrongholdDraft } from '@app/widgets/card-editor/StrongholdCardEditor';
import { StrongholdCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

export function StrongholdEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  return (
    <CardEditGate
      type="card-stronghold"
      schemaName="stronghold card"
      schema={StrongholdCardAssetInput}
      slug={slug}
      loaderData={loaderData}
      session={(props) => <CardEditSession {...props} />}
    />
  );
}

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

function CardEditSession({ asset, initialDraft, access }: CardEditSessionProps<StrongholdDraft>) {
  const saving = useCardSave('card-stronghold', asset);
  const [chapter, setChapter] = useState<StrongholdChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft));
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
