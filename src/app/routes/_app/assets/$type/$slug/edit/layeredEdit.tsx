import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { compareCodeUnits } from '@shared/compareText';
import { useReducer, useState } from 'react';

import { useAssetPage } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { INITIAL_CUSTOM_CARD_MEMORY } from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter, CustomCardMemory } from '@app/widgets/card-editor/CustomCardEditor';

import { assetNameField } from '../../../assetEditorStates';
import type { LayeredCardDraft, LayeredCardEditing } from '../../../layeredCardEditing';
import { layeredCardTokenPicker } from '../../../layeredCardTokenPicker';
import { CardEditFrame, CardEditChecks, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

export function LayeredEditPage<Draft extends LayeredCardDraft>({
  slug,
  loaderData,
  config,
}: {
  slug: string;
  loaderData: AssetPageData;
  config: LayeredCardEditing<Draft>;
}) {
  const parsed = config.schema.safeParse(loaderData?.asset.data);
  return (
    <LayeredCardSessionGate
      key={`${config.type}/${slug}`}
      config={config}
      slug={slug}
      loaderData={loaderData}
      initialDraft={parsed.success ? parsed.data : null}
    />
  );
}

function LayeredCardSessionGate<Draft extends LayeredCardDraft>({
  config,
  slug,
  loaderData,
  initialDraft,
}: {
  slug: string;
  loaderData: AssetPageData;
  initialDraft: Draft | null;
  config: LayeredCardEditing<Draft>;
}) {
  const [state, dispatch] = useReducer(reduce<Draft>, undefined, () =>
    initialDraft ? openingState(initialDraft, initialDraft) : null
  );
  const tokenIds = [
    ...new Set(state?.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : [])) ?? []),
  ].sort(compareCodeUnits);
  const query = useAssetPage(config.type, slug, { initialData: loaderData, embeddedTokenIds: tokenIds });
  const data = query.data === undefined ? loaderData : query.data;
  /* A live recovery opens the draft once, before rendering its controls. Later reads never replace local edits. */
  if (!state && data) {
    const parsed = config.schema.safeParse(data.asset.data);
    if (parsed.success) {
      dispatch({ kind: 'open', data: parsed.data });
    }
  }
  return (
    <CardEditChecks
      type={config.type}
      schemaName={config.schemaName}
      schema={config.schema}
      data={data}
      session={(props) =>
        state ? <CardEditSession config={config} {...props} state={state} dispatch={dispatch} /> : null
      }
    />
  );
}

type CardState<Draft extends LayeredCardDraft> = { data: Draft; memory: CustomCardMemory; baseline: Draft };

type CardEvent<Draft extends LayeredCardDraft> =
  | { kind: 'open'; data: Draft }
  | { kind: 'patch'; update: Partial<Draft> }
  | { kind: 'remember'; update: Partial<CustomCardMemory> }
  | { kind: 'replace'; data: Draft }
  | { kind: 'saved'; data: Draft };

function openingState<Draft extends LayeredCardDraft>(data: Draft, baseline: Draft): CardState<Draft> {
  return { data, memory: INITIAL_CUSTOM_CARD_MEMORY, baseline };
}

function reduce<Draft extends LayeredCardDraft>(
  state: CardState<Draft> | null,
  event: CardEvent<Draft>
): CardState<Draft> | null {
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

function CardEditSession<Draft extends LayeredCardDraft>({
  config,
  frontPresets,
  asset,
  access,
  tokens,
  tokensError,
  state,
  dispatch,
}: CardEditSessionProps<Draft> & {
  state: CardState<Draft>;
  config: LayeredCardEditing<Draft>;
  dispatch: (event: CardEvent<Draft>) => void;
}) {
  const Editor = config.Editor;
  const saving = useCardSave(config.type, asset);
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  const patch = (update: Partial<Draft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ ...state.data, name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const header = useEditPageHeader({
    warnings: config.warnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const validation = config.input.safeParse(state.data);
  const invalid = tokensError ?? (validation.success ? undefined : validation.error.issues[0]?.message);
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success) {
      return;
    }
    const payload = postedPayload(config.input, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardEditFrame
      type={config.type}
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      <Editor
        frontStyle={cardFrontStyleFor(config.type, state.data, frontPresets)}
        tokens={tokens ?? {}}
        tokensError={tokensError}
        tokenPicker={layeredCardTokenPicker}
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
