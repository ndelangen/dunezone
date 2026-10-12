import type { CustomCardTokenResolution } from '@shared/assets/schema';
import { compareCodeUnits } from '@shared/compareText';
import { useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useCustomCardTokens } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_STORM_CARD_DRAFT,
  INITIAL_STORM_CARD_MEMORY,
  StormCardEditor,
} from '@app/widgets/card-editor/StormCardEditor';
import type { StormCardChapter, StormCardDraft, StormCardMemory } from '@app/widgets/card-editor/StormCardEditor';
import { StormCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../assetEditorStates';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

type StormCardState = { data: StormCardDraft; memory: StormCardMemory; baseline: StormCardDraft };

type StormCardEvent =
  | { kind: 'patch'; update: Partial<StormCardDraft> }
  | { kind: 'remember'; update: Partial<StormCardMemory> }
  | { kind: 'replace'; data: StormCardDraft }
  | { kind: 'saved'; data: StormCardDraft };

function openingState(data: StormCardDraft, baseline: StormCardDraft): StormCardState {
  return { data, memory: INITIAL_STORM_CARD_MEMORY, baseline };
}

function reduce(state: StormCardState, event: StormCardEvent): StormCardState {
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

function DraftTokenRead({
  ids,
  render,
}: {
  ids: string[];
  render: (tokens: z.infer<typeof CustomCardTokenResolution>) => ReactNode;
}) {
  const tokens = useCustomCardTokens(ids);
  return render(tokens ?? { tokens: {}, error: null });
}

export function StormCreatePage() {
  const saving = useCardCreate('card-storm');
  const [chapter, setChapter] = useState<StormCardChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_STORM_CARD_DRAFT, INITIAL_STORM_CARD_DRAFT)
  );
  const patch = (update: Partial<StormCardDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ name }),
  });
  const header = useEditPageHeader({
    warnings: [],
    onFocusWarning: () => {},
  });
  const validation = StormCardAssetInput.safeParse(state.data);
  const invalid = validation.success ? undefined : validation.error.issues[0]?.message;
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success) {
      return;
    }
    const payload = postedPayload(StormCardAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  const tokenIds = [
    ...new Set(state.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : []))),
  ].sort(compareCodeUnits);
  const editor = ({ tokens, error }: z.infer<typeof CustomCardTokenResolution>) => (
    <StormCardEditor
      tokens={tokens}
      tokensError={error}
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
  );
  return (
    <CardCreateFrame
      type="card-storm"
      title="New storm card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: StormCardAssetInput,
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      {tokenIds.length ? <DraftTokenRead ids={tokenIds} render={editor} /> : editor({ tokens: {}, error: null })}
    </CardCreateFrame>
  );
}
