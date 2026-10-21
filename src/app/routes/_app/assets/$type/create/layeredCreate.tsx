import { cardFrontStyleFor, newCardWithStandards } from '@shared/assets/cardFrontPresets';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { CustomCardTokenResolution } from '@shared/assets/schema';
import { compareCodeUnits } from '@shared/compareText';
import { useReducer, useState } from 'react';
import type { z } from 'zod';

import { useAuthoringPresets } from '@db/backgroundPresets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { INITIAL_CUSTOM_CARD_MEMORY } from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter, CustomCardMemory } from '@app/widgets/card-editor/CustomCardEditor';

import { assetNameField } from '../../assetEditorStates';
import type { LayeredCardDraft, LayeredCardEditing } from '../../layeredCardEditing';
import { layeredCardTokenPicker } from '../../layeredCardTokenPicker';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

type CardState<Draft extends LayeredCardDraft> = { data: Draft; memory: CustomCardMemory; baseline: Draft };

type CardEvent<Draft extends LayeredCardDraft> =
  | { kind: 'patch'; update: Partial<Draft> }
  | { kind: 'remember'; update: Partial<CustomCardMemory> }
  | { kind: 'replace'; data: Draft }
  | { kind: 'saved'; data: Draft };

function openingState<Draft extends LayeredCardDraft>(data: Draft, baseline: Draft): CardState<Draft> {
  return { data, memory: INITIAL_CUSTOM_CARD_MEMORY, baseline };
}

function reduce<Draft extends LayeredCardDraft>(state: CardState<Draft>, event: CardEvent<Draft>): CardState<Draft> {
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

export function LayeredCreatePage<Draft extends LayeredCardDraft>({ config }: { config: LayeredCardEditing<Draft> }) {
  const Editor = config.Editor;
  const saving = useCardCreate(config.type);
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  const [state, dispatch] = useReducer(reduce<Draft>, undefined, () =>
    openingState(newCardWithStandards(config.type, config.initial), newCardWithStandards(config.type, config.initial))
  );
  const patch = (update: Partial<Draft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ ...state.data, name }),
  });
  const header = useEditPageHeader({
    warnings: config.warnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const validation = config.input.safeParse(state.data);
  const invalid = validation.success ? undefined : validation.error.issues[0]?.message;
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success) {
      return;
    }
    const payload = postedPayload(config.input, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  const tokenIds = [
    ...new Set(state.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : []))),
  ].sort(compareCodeUnits);
  const standards = useAuthoringPresets(true, tokenIds);
  const editor = ({ tokens, error, style }: z.infer<typeof CustomCardTokenResolution> & { style?: CardFrontStyle }) => (
    <Editor
      frontStyle={style}
      tokens={tokens}
      tokensError={error}
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
  );
  return (
    <CardCreateFrame
      loadingPresets={!standards}
      backgrounds={standards?.backgrounds ?? []}
      fronts={standards?.fronts ?? []}
      type={config.type}
      title={`New ${config.schemaName}`}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: config.input,
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      {editor({
        tokens: standards?.tokens ?? {},
        error: standards?.error ?? null,
        style: cardFrontStyleFor(config.type, state.data, standards?.fronts ?? []),
      })}
    </CardCreateFrame>
  );
}
