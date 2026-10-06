import { useReducer, useState } from 'react';

import type { AssetPageData } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_CUSTOM_CARD_MEMORY,
  CustomCardEditor,
  customCardDraftWarnings,
} from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter, CustomCardDraft, CustomCardMemory } from '@app/widgets/card-editor/CustomCardEditor';
import { CustomCardAsset, CustomCardAssetInput } from '@game/data/objects';

import { useAssetNameField } from '../../../assetEditorStates';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

export function CustomEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  return (
    <CardEditGate
      type="card-custom"
      schemaName="custom card"
      schema={CustomCardAsset}
      slug={slug}
      loaderData={loaderData}
      session={(props) => <CardEditSession {...props} />}
    />
  );
}

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

function CardEditSession({ asset, initialDraft, access }: CardEditSessionProps<CustomCardDraft>) {
  const saving = useCardSave('card-custom', asset);
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft));
  const patch = (update: Partial<CustomCardDraft>) => dispatch({ kind: 'patch', update });
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'card-custom',
    name: state.data.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Head',
    chapter: 'head' as CustomCardChapter,
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
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
    <CardEditFrame
      type="card-custom"
      asset={asset}
      access={access}
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
    </CardEditFrame>
  );
}
