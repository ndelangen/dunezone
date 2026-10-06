import type { CustomCardTokenResolution } from '@shared/assets/schema';
import { useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useCustomCardTokens } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_CUSTOM_CARD_DRAFT,
  INITIAL_CUSTOM_CARD_MEMORY,
  CustomCardEditor,
  customCardDraftWarnings,
} from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter, CustomCardDraft, CustomCardMemory } from '@app/widgets/card-editor/CustomCardEditor';
import { CustomCardAssetInput } from '@game/data/objects';

import { useAssetNameField } from '../../assetEditorStates';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

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

export function CustomCreatePage() {
  const saving = useCardCreate('card-custom');
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_CUSTOM_CARD_DRAFT, INITIAL_CUSTOM_CARD_DRAFT)
  );
  const patch = (update: Partial<CustomCardDraft>) => dispatch({ kind: 'patch', update });
  const { nameField, conflictWarnings } = useAssetNameField({
    canRename: true,
    type: 'card-custom',
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Head',
    chapter: 'head' as CustomCardChapter,
  });
  const header = useEditPageHeader({
    warnings: [...customCardDraftWarnings(state.data), ...conflictWarnings],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const validation = CustomCardAssetInput.safeParse(state.data);
  const invalid = validation.success ? undefined : validation.error.issues[0]?.message;
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success) {
      return;
    }
    const payload = postedPayload(CustomCardAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  const tokenIds = [
    ...new Set(state.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : []))),
  ].sort();
  const editor = ({ tokens, error }: z.infer<typeof CustomCardTokenResolution>) => (
    <CustomCardEditor
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
      type="card-custom"
      title="New custom card"
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      {tokenIds.length ? <DraftTokenRead ids={tokenIds} render={editor} /> : editor({ tokens: {}, error: null })}
    </CardCreateFrame>
  );
}
