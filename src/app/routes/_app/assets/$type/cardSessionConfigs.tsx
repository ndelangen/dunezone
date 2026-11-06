import { StrongholdCardAssetInput } from '@shared/assets/schema';

import { INITIAL_NEXUS_DRAFT, NexusCardEditor, nexusDraftWarnings } from '@app/widgets/card-editor/NexusCardEditor';
import type { NexusChapter, NexusDraft } from '@app/widgets/card-editor/NexusCardEditor';
import {
  INITIAL_STRONGHOLD_DRAFT,
  StrongholdCardEditor,
  strongholdDraftWarnings,
} from '@app/widgets/card-editor/StrongholdCardEditor';
import type { StrongholdChapter, StrongholdDraft } from '@app/widgets/card-editor/StrongholdCardEditor';
import { NexusCardAssetInput } from '@game/data/objects';

import { plainDraftSession } from './cardSession';
import type { CardSessionConfig, DraftState } from './cardSession';
import { nexusDraftStatus, openingNexusState, reduceNexusDraft } from './nexusAuthoring';
import type { NexusEvent, NexusState } from './nexusAuthoring';

/* What each card type's edit and create pages are made of; `CardTypeEditPage` and `CardTypeCreatePage` do the rest. */

export const nexusCardSession: CardSessionConfig<
  NexusDraft,
  NexusChapter,
  NexusState,
  Extract<NexusEvent, { kind: 'remember' }>
> = {
  type: 'card-nexus',
  noun: 'nexus card',
  schema: NexusCardAssetInput,
  initialDraft: INITIAL_NEXUS_DRAFT,
  firstChapter: 'head',
  open: openingNexusState,
  reduce: reduceNexusDraft,
  /* A new nexus card needs its faction before it exists; an existing one already has it. */
  status: (state, mode) => nexusDraftStatus(state, mode === 'create'),
  warnings: nexusDraftWarnings,
  renderEditor: ({ state, dispatch, ...editor }) => (
    <NexusCardEditor
      {...editor}
      draft={state.data}
      memory={state.memory}
      remember={(update) => dispatch({ kind: 'remember', update })}
    />
  ),
};

const strongholdDrafts = plainDraftSession<StrongholdDraft>(StrongholdCardAssetInput);

export const strongholdCardSession: CardSessionConfig<
  StrongholdDraft,
  StrongholdChapter,
  DraftState<StrongholdDraft>
> = {
  type: 'card-stronghold',
  noun: 'stronghold card',
  schema: StrongholdCardAssetInput,
  initialDraft: INITIAL_STRONGHOLD_DRAFT,
  firstChapter: 'head',
  ...strongholdDrafts,
  warnings: strongholdDraftWarnings,
  renderEditor: ({ state, frontStyle, nameField, patch, chapter, onChapterChange, onSettle }) => (
    <StrongholdCardEditor
      frontStyle={frontStyle}
      nameField={nameField}
      draft={state.data}
      patch={patch}
      chapter={chapter}
      onChapterChange={onChapterChange}
      onSettle={onSettle}
    />
  ),
};
