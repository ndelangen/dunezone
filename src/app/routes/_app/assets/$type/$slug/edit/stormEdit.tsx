import { compareCodeUnits } from '@shared/compareText';
import { useReducer, useState } from 'react';

import { useAssetPage } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { INITIAL_STORM_CARD_MEMORY, StormCardEditor } from '@app/widgets/card-editor/StormCardEditor';
import type { StormCardChapter, StormCardDraft, StormCardMemory } from '@app/widgets/card-editor/StormCardEditor';
import { StormCardAsset, StormCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { CardEditFrame, CardEditChecks, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

export function StormEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  const parsed = StormCardAsset.safeParse(loaderData?.asset.data);
  return (
    <StormCardSessionGate
      key={slug}
      slug={slug}
      loaderData={loaderData}
      initialDraft={parsed.success ? parsed.data : null}
    />
  );
}

function StormCardSessionGate({
  slug,
  loaderData,
  initialDraft,
}: {
  slug: string;
  loaderData: AssetPageData;
  initialDraft: StormCardDraft | null;
}) {
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    initialDraft ? openingState(initialDraft, initialDraft) : null
  );
  const tokenIds = [
    ...new Set(state?.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : [])) ?? []),
  ].sort(compareCodeUnits);
  const query = useAssetPage('card-storm', slug, { initialData: loaderData, embeddedTokenIds: tokenIds });
  const data = query.data === undefined ? loaderData : query.data;
  /* A live recovery opens the draft once, before rendering its controls. Later reads never replace local edits. */
  if (!state && data) {
    const parsed = StormCardAsset.safeParse(data.asset.data);
    if (parsed.success) {
      dispatch({ kind: 'open', data: parsed.data });
    }
  }
  return (
    <CardEditChecks
      type="card-storm"
      schemaName="storm card"
      schema={StormCardAsset}
      data={data}
      session={(props) => (state ? <CardEditSession {...props} state={state} dispatch={dispatch} /> : null)}
    />
  );
}

type StormCardState = { data: StormCardDraft; memory: StormCardMemory; baseline: StormCardDraft };

type StormCardEvent =
  | { kind: 'open'; data: StormCardDraft }
  | { kind: 'patch'; update: Partial<StormCardDraft> }
  | { kind: 'remember'; update: Partial<StormCardMemory> }
  | { kind: 'replace'; data: StormCardDraft }
  | { kind: 'saved'; data: StormCardDraft };

function openingState(data: StormCardDraft, baseline: StormCardDraft): StormCardState {
  return { data, memory: INITIAL_STORM_CARD_MEMORY, baseline };
}

function reduce(state: StormCardState | null, event: StormCardEvent): StormCardState | null {
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
}: CardEditSessionProps<StormCardDraft> & {
  state: StormCardState;
  dispatch: (event: StormCardEvent) => void;
}) {
  const saving = useCardSave('card-storm', asset);
  const [chapter, setChapter] = useState<StormCardChapter>('head');
  const patch = (update: Partial<StormCardDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const header = useEditPageHeader({
    warnings: [],
    onFocusWarning: () => {},
  });
  const validation = StormCardAssetInput.safeParse(state.data);
  const invalid = tokensError ?? (validation.success ? undefined : validation.error.issues[0]?.message);
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success) {
      return;
    }
    const payload = postedPayload(StormCardAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardEditFrame
      type="card-storm"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      <StormCardEditor
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
