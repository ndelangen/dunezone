import { useReducer, useState } from 'react';

import { useAssetPage } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_CUSTOM_CARD_MEMORY,
  CustomCardEditor,
  customCardDraftWarnings,
} from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter, CustomCardDraft, CustomCardMemory } from '@app/widgets/card-editor/CustomCardEditor';
import { CustomCardAsset, CustomCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { CardEditFrame, CardEditChecks, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

export function CustomEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  const parsed = CustomCardAsset.safeParse(loaderData?.asset.data);
  return (
    <CustomCardSessionGate
      key={slug}
      slug={slug}
      loaderData={loaderData}
      initialDraft={parsed.success ? parsed.data : null}
    />
  );
}

function CustomCardSessionGate({
  slug,
  loaderData,
  initialDraft,
}: {
  slug: string;
  loaderData: AssetPageData;
  initialDraft: CustomCardDraft | null;
}) {
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    initialDraft ? openingState(initialDraft, initialDraft) : null
  );
  const tokenIds = [
    ...new Set(state?.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : [])) ?? []),
  ].sort();
  const query = useAssetPage('card-custom', slug, { initialData: loaderData, embeddedTokenIds: tokenIds });
  const data = query.data === undefined ? loaderData : query.data;
  /* A live recovery opens the draft once, before rendering its controls. Later reads never replace local edits. */
  if (!state && data) {
    const parsed = CustomCardAsset.safeParse(data.asset.data);
    if (parsed.success) {
      dispatch({ kind: 'open', data: parsed.data });
    }
  }
  return (
    <CardEditChecks
      type="card-custom"
      schemaName="custom card"
      schema={CustomCardAsset}
      data={data}
      session={(props) => (state ? <CardEditSession {...props} state={state} dispatch={dispatch} /> : null)}
    />
  );
}

type CustomCardState = { data: CustomCardDraft; memory: CustomCardMemory; baseline: CustomCardDraft };

type CustomCardEvent =
  | { kind: 'open'; data: CustomCardDraft }
  | { kind: 'patch'; update: Partial<CustomCardDraft> }
  | { kind: 'remember'; update: Partial<CustomCardMemory> }
  | { kind: 'replace'; data: CustomCardDraft }
  | { kind: 'saved'; data: CustomCardDraft };

function openingState(data: CustomCardDraft, baseline: CustomCardDraft): CustomCardState {
  return { data, memory: INITIAL_CUSTOM_CARD_MEMORY, baseline };
}

function reduce(state: CustomCardState | null, event: CustomCardEvent): CustomCardState | null {
  if (event.kind === 'open') {
    return state ?? openingState(event.data, event.data);
  }
  if (!state) {
    return null;
  }
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

function CardEditSession({
  asset,
  access,
  tokens,
  tokensError,
  state,
  dispatch,
}: CardEditSessionProps<CustomCardDraft> & {
  state: CustomCardState;
  dispatch: (event: CustomCardEvent) => void;
}) {
  const saving = useCardSave('card-custom', asset);
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  const patch = (update: Partial<CustomCardDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const header = useEditPageHeader({
    warnings: [...customCardDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const validation = CustomCardAssetInput.safeParse(state.data);
  const invalid = tokensError ?? (validation.success ? undefined : validation.error.issues[0]?.message);
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success) {
      return;
    }
    const payload = postedPayload(CustomCardAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardEditFrame
      type="card-custom"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      <CustomCardEditor
        tokens={tokens ?? {}}
        tokensError={tokensError}
        tokenPicker={(onPick, onCancel) => (
          <AssetPicker
            types={['token-disc', 'token-tech', 'token-plate', 'token-enhance']}
            copy={{
              searchLabel: 'Find a token',
              searchPlaceholder: 'Name, shape or creator',
              emptyMessage: 'No token assets are available yet.',
            }}
            onPick={(picked) => onPick(picked.id)}
            onCancel={onCancel}
          />
        )}
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
