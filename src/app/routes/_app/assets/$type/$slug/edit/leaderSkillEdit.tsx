import { useReducer, useState } from 'react';

import type { AssetPageData } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_LEADER_SKILL_MEMORY,
  LeaderSkillCardEditor,
  leaderSkillDraftWarnings,
} from '@app/widgets/card-editor/LeaderSkillCardEditor';
import type {
  LeaderSkillChapter,
  LeaderSkillDraft,
  LeaderSkillMemory,
} from '@app/widgets/card-editor/LeaderSkillCardEditor';
import { LeaderSkillAsset, LeaderSkillAssetInput } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

/** The leader skill card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-leaderability`. */
export function LeaderSkillEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  return (
    <CardEditGate
      type="card-leaderability"
      schemaName="leader skill card"
      schema={LeaderSkillAsset}
      slug={slug}
      loaderData={loaderData}
      session={(props) => <CardEditSession {...props} />}
    />
  );
}

/** The page owns the card draft, background memory and reset baseline. */
type LeaderSkillState = { data: LeaderSkillDraft; memory: LeaderSkillMemory; baseline: LeaderSkillDraft };

type LeaderSkillEvent =
  | { kind: 'patch'; update: Partial<LeaderSkillDraft> }
  | { kind: 'remember'; update: Partial<LeaderSkillMemory> }
  | { kind: 'replace'; data: LeaderSkillDraft }
  | { kind: 'saved'; data: LeaderSkillDraft };

function openingState(data: LeaderSkillDraft, baseline: LeaderSkillDraft): LeaderSkillState {
  return { data, memory: INITIAL_LEADER_SKILL_MEMORY, baseline };
}

function reduce(state: LeaderSkillState, event: LeaderSkillEvent): LeaderSkillState {
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

function CardEditSession({ asset, initialDraft, access }: CardEditSessionProps<LeaderSkillDraft>) {
  const saving = useCardSave('card-leaderability', asset);
  const [overflow, setOverflow] = useState(false);
  const [chapter, setChapter] = useState<LeaderSkillChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft));
  const patch = (update: Partial<LeaderSkillDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const header = useEditPageHeader({
    warnings: [...leaderSkillDraftWarnings(state.data)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const validation = LeaderSkillAssetInput.safeParse(state.data);
  const invalid = overflow
    ? 'The abilities extend beyond the card. Shorten them or reduce the text size.'
    : validation.success
      ? undefined
      : validation.error.issues[0]?.message;
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    if (!validation.success || overflow) {
      return;
    }
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const payload = postedPayload(LeaderSkillAssetInput, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardEditFrame
      type="card-leaderability"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      <LeaderSkillCardEditor
        nameField={nameField}
        draft={state.data}
        patch={patch}
        memory={state.memory}
        remember={(update) => dispatch({ kind: 'remember', update })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
        onOverflow={setOverflow}
      />
    </CardEditFrame>
  );
}
