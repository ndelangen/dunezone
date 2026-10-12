import { useReducer, useState } from 'react';

import type { AssetPageData } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { INITIAL_NEXUS_MEMORY, NexusCardEditor, nexusDraftWarnings } from '@app/widgets/card-editor/NexusCardEditor';
import type { NexusChapter, NexusDraft, NexusMemory } from '@app/widgets/card-editor/NexusCardEditor';
import { NexusCardAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

/** The nexus card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-nexus`. */
export function NexusEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  return (
    <CardEditGate
      type="card-nexus"
      schemaName="nexus card"
      schema={NexusCardAssetInput}
      slug={slug}
      loaderData={loaderData}
      session={(props) => <CardEditSession {...props} />}
    />
  );
}

/* The page owns the saved baseline, draft and temporary background choices. */
type NexusState = { data: NexusDraft; memory: NexusMemory; baseline: NexusDraft };

type NexusEvent =
  | { kind: 'patch'; update: Partial<NexusDraft> }
  | { kind: 'remember'; update: Partial<NexusMemory> }
  | { kind: 'replace'; data: NexusDraft }
  | { kind: 'saved'; data: NexusDraft };

function openingState(data: NexusDraft, baseline: NexusDraft): NexusState {
  return { data, memory: INITIAL_NEXUS_MEMORY, baseline };
}

function reduce(state: NexusState, event: NexusEvent): NexusState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets. */
    case 'replace':
      return openingState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

function CardEditSession({ asset, initialDraft, access }: CardEditSessionProps<NexusDraft>) {
  const saving = useCardSave('card-nexus', asset);
  const [chapter, setChapter] = useState<NexusChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft));
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
  /* Only draft changes enable Save. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const validation = NexusCardAssetInput.safeParse(state.data);
  const invalid = validation.success ? undefined : validation.error.issues[0]?.message;
  const save = () => {
    if (!validation.success) {
      return;
    }

    const payload = postedPayload(NexusCardAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
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
      saveError={saving.error}
    >
      <NexusCardEditor
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
