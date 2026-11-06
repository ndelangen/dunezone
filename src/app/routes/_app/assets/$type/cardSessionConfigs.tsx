import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { EMPTY_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { DUKE_PRAD_VIDAL_TOKEN, EMPTY_LEADER_TOKEN } from '@shared/assets/leaderToken';
import {
  CustomCardAssetInput,
  CustomCardAsset,
  HomeworldCardAssetInput,
  LeaderTokenAssetInput,
  StormCardAsset,
  StormCardAssetInput,
  StrongholdCardAssetInput,
} from '@shared/assets/schema';
import { compareCodeUnits } from '@shared/compareText';
import type { ComponentProps, ComponentType } from 'react';
import type { z } from 'zod';

import type { StoredShape } from '@app/widgets/authoring/authoringEnvelope';
import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import {
  CustomCardEditor,
  INITIAL_CUSTOM_CARD_DRAFT,
  INITIAL_CUSTOM_CARD_MEMORY,
  customCardDraftWarnings,
} from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter, CustomCardMemory } from '@app/widgets/card-editor/CustomCardEditor';
import { HomeworldCardEditor, homeworldDraftWarnings } from '@app/widgets/card-editor/HomeworldCardEditor';
import type { HomeworldChapter, HomeworldDraft } from '@app/widgets/card-editor/HomeworldCardEditor';
import {
  INITIAL_LEADER_SKILL_DRAFT,
  INITIAL_LEADER_SKILL_MEMORY,
  LeaderSkillCardEditor,
  leaderSkillDraftWarnings,
} from '@app/widgets/card-editor/LeaderSkillCardEditor';
import type {
  LeaderSkillChapter,
  LeaderSkillDraft,
  LeaderSkillMemory,
} from '@app/widgets/card-editor/LeaderSkillCardEditor';
import {
  INITIAL_NEXUS_DRAFT,
  INITIAL_NEXUS_MEMORY,
  NexusCardEditor,
  nexusDraftWarnings,
} from '@app/widgets/card-editor/NexusCardEditor';
import type { NexusChapter, NexusDraft, NexusMemory } from '@app/widgets/card-editor/NexusCardEditor';
import { INITIAL_SPICE_DRAFT, SpiceCardEditor, spiceDraftWarnings } from '@app/widgets/card-editor/SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';
import { INITIAL_STORM_CARD_DRAFT, StormCardEditor } from '@app/widgets/card-editor/StormCardEditor';
import {
  INITIAL_STRONGHOLD_DRAFT,
  StrongholdCardEditor,
  strongholdDraftWarnings,
} from '@app/widgets/card-editor/StrongholdCardEditor';
import type { StrongholdChapter, StrongholdDraft } from '@app/widgets/card-editor/StrongholdCardEditor';
import {
  INITIAL_TREACHERY_DRAFT,
  INITIAL_TREACHERY_MEMORY,
  TreacheryCardEditor,
  treacheryDraftWarnings,
} from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter, TreacheryDraft, TreacheryMemory } from '@app/widgets/card-editor/TreacheryCardEditor';
import { LeaderTokenEditor, leaderTokenDraftWarnings } from '@app/widgets/token-editor/LeaderTokenEditor';
import type {
  LeaderTokenChapter,
  LeaderTokenDraft,
  LeaderTokenMemory,
} from '@app/widgets/token-editor/LeaderTokenEditor';
import {
  LeaderSkillAsset,
  LeaderSkillAssetInput,
  NexusCardAssetInput,
  SpiceAsset,
  TreacheryAsset,
} from '@game/data/objects';

import { layeredCardTokenPicker } from '../layeredCardTokenPicker';
import { SpiceBoardRead, spiceBoardSelect } from '../spiceCardBoard';
import { memoryDraftSession, plainDraftSession } from './cardDrafts';
import type { DraftState, MemoryState, RememberEvent } from './cardDrafts';
import type { CardSessionConfig } from './cardSession';

/* What each card type's edit and create pages are made of; `CardTypeEditPage` and `CardTypeCreatePage` do the rest. */

const treacheryDrafts = memoryDraftSession<TreacheryDraft, TreacheryMemory>(
  TreacheryAsset,
  () => INITIAL_TREACHERY_MEMORY
);

export const treacheryCardSession: CardSessionConfig<
  TreacheryDraft,
  TreacheryChapter,
  MemoryState<TreacheryDraft, TreacheryMemory>,
  RememberEvent<TreacheryMemory>
> = {
  type: 'card-treachery',
  noun: 'treachery card',
  schema: TreacheryAsset,
  initialDraft: INITIAL_TREACHERY_DRAFT,
  firstChapter: 'head',
  ...treacheryDrafts,
  warnings: treacheryDraftWarnings,
  renderEditor: ({ state, dispatch, frontStyle, nameField, patch, chapter, onChapterChange, onSettle }) => (
    <TreacheryCardEditor
      frontStyle={frontStyle}
      nameField={nameField}
      draft={state.data}
      patch={patch}
      memory={state.memory}
      remember={(update) => dispatch({ kind: 'remember', update })}
      chapter={chapter}
      onChapterChange={onChapterChange}
      onSettle={onSettle}
    />
  ),
};

/* A spice card has no background composer, so there is no session memory beside the draft. */
export const spiceCardSession: CardSessionConfig<SpiceDraft, SpiceChapter, DraftState<SpiceDraft>> = {
  type: 'card-spice',
  noun: 'spice card',
  schema: SpiceAsset,
  initialDraft: INITIAL_SPICE_DRAFT,
  firstChapter: 'identity',
  ...plainDraftSession<SpiceDraft>(SpiceAsset),
  warnings: spiceDraftWarnings,
  renderEditor: ({ state, nameField, patch, chapter, onChapterChange, onSettle }) => (
    <SpiceBoardRead
      draft={state.data}
      render={(boardRead) => (
        <SpiceCardEditor
          nameField={nameField}
          draft={state.data}
          patch={patch}
          chapter={chapter}
          onChapterChange={onChapterChange}
          onSettle={onSettle}
          boardRead={boardRead}
          boardSelect={spiceBoardSelect}
          tokenPicker={layeredCardTokenPicker}
        />
      )}
    />
  ),
};

/** A leader skill session also knows whether the abilities currently overflow the card, which the editor measures. */
type LeaderSkillState = MemoryState<LeaderSkillDraft, LeaderSkillMemory> & { overflow: boolean };
type LeaderSkillEvent = RememberEvent<LeaderSkillMemory> | { kind: 'overflow'; overflow: boolean };

const leaderSkillDrafts = memoryDraftSession<LeaderSkillDraft, LeaderSkillMemory>(
  LeaderSkillAssetInput,
  () => INITIAL_LEADER_SKILL_MEMORY
);

export const leaderSkillCardSession: CardSessionConfig<
  LeaderSkillDraft,
  LeaderSkillChapter,
  LeaderSkillState,
  LeaderSkillEvent
> = {
  type: 'card-leaderability',
  noun: 'leader skill card',
  schema: LeaderSkillAssetInput,
  storedSchema: LeaderSkillAsset,
  initialDraft: INITIAL_LEADER_SKILL_DRAFT,
  firstChapter: 'head',
  open: (data, baseline) => ({ ...leaderSkillDrafts.open(data, baseline), overflow: false }),
  reduce: (state, event) => {
    if (event.kind === 'overflow') {
      return state.overflow === event.overflow ? state : { ...state, overflow: event.overflow };
    }
    /* The measurement belongs to what is on screen, so a load or reset keeps it until the editor measures again. */
    return { ...leaderSkillDrafts.reduce(state, event), overflow: state.overflow };
  },
  status: (state) => {
    const status = leaderSkillDrafts.status(state);
    return state.overflow
      ? { ...status, invalid: 'The abilities extend beyond the card. Shorten them.', payload: null }
      : status;
  },
  warnings: leaderSkillDraftWarnings,
  renderEditor: ({ state, dispatch, frontStyle, nameField, patch, chapter, onChapterChange, onSettle }) => (
    <LeaderSkillCardEditor
      frontStyle={frontStyle}
      nameField={nameField}
      draft={state.data}
      patch={patch}
      memory={state.memory}
      remember={(update) => dispatch({ kind: 'remember', update })}
      chapter={chapter}
      onChapterChange={onChapterChange}
      onSettle={onSettle}
      onOverflow={(overflow) => dispatch({ kind: 'overflow', overflow })}
    />
  ),
};

export const homeworldCardSession: CardSessionConfig<HomeworldDraft, HomeworldChapter, DraftState<HomeworldDraft>> = {
  type: 'card-homeworld',
  noun: 'homeworld card',
  schema: HomeworldCardAssetInput,
  initialDraft: EMPTY_HOMEWORLD_CARD,
  firstChapter: 'head',
  ...plainDraftSession<HomeworldDraft>(HomeworldCardAssetInput),
  warnings: homeworldDraftWarnings,
  renderEditor: ({ state, frontStyle, nameField, patch, chapter, onChapterChange, onSettle }) => (
    <HomeworldCardEditor
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

const nexusDrafts = memoryDraftSession<NexusDraft, NexusMemory>(NexusCardAssetInput, () => INITIAL_NEXUS_MEMORY);

export const nexusCardSession: CardSessionConfig<
  NexusDraft,
  NexusChapter,
  MemoryState<NexusDraft, NexusMemory>,
  RememberEvent<NexusMemory>
> = {
  type: 'card-nexus',
  noun: 'nexus card',
  schema: NexusCardAssetInput,
  initialDraft: INITIAL_NEXUS_DRAFT,
  firstChapter: 'head',
  ...nexusDrafts,
  /* A new nexus card needs its faction before it exists; an existing one already has it. */
  status: (state, mode) => {
    const status = nexusDrafts.status(state);
    return mode === 'create' && !state.data.factionLink
      ? { ...status, invalid: 'Choose a faction', payload: null }
      : status;
  },
  warnings: nexusDraftWarnings,
  renderEditor: ({ state, dispatch, ...editor }) => (
    <NexusCardEditor
      frontStyle={editor.frontStyle}
      nameField={editor.nameField}
      patch={editor.patch}
      chapter={editor.chapter}
      onChapterChange={editor.onChapterChange}
      onSettle={editor.onSettle}
      draft={state.data}
      memory={state.memory}
      remember={(update) => dispatch({ kind: 'remember', update })}
    />
  ),
};

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
  ...plainDraftSession<StrongholdDraft>(StrongholdCardAssetInput),
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

export const leaderTokenSession: CardSessionConfig<
  LeaderTokenDraft,
  LeaderTokenChapter,
  MemoryState<LeaderTokenDraft, LeaderTokenMemory>,
  RememberEvent<LeaderTokenMemory>
> = {
  type: 'token-leader',
  noun: 'leader token',
  schema: LeaderTokenAssetInput,
  initialDraft: EMPTY_LEADER_TOKEN,
  firstChapter: 'identity',
  loadPresets: [{ label: 'Duke Prad Vidal', name: DUKE_PRAD_VIDAL_TOKEN.name, data: DUKE_PRAD_VIDAL_TOKEN }],
  ...memoryDraftSession<LeaderTokenDraft, LeaderTokenMemory>(LeaderTokenAssetInput, () => ({
    declaredCustom: false,
    backgroundMode: emptyBackgroundModeMemory(),
    refusedStrength: null,
  })),
  warnings: leaderTokenDraftWarnings,
  renderEditor: ({ state, dispatch, nameField, patch, chapter, onChapterChange, onSettle }) => (
    <LeaderTokenEditor
      nameField={nameField}
      draft={state.data}
      patch={patch}
      memory={state.memory}
      remember={(update) => dispatch({ kind: 'remember', update })}
      chapter={chapter}
      onChapterChange={onChapterChange}
      onSettle={onSettle}
    />
  ),
};

type LayeredCardDraft = Pick<z.infer<typeof CustomCardAsset>, 'name' | 'about' | 'layers'>;

/** The custom and storm cards share one editor shape: free layers, some of them placed tokens whose faces the page reads. */
function layeredCardSession<Draft extends LayeredCardDraft>(layered: {
  type: 'card-custom' | 'card-storm';
  noun: string;
  schema: z.ZodType<Draft> & StoredShape;
  storedSchema: z.ZodType<Draft>;
  initialDraft: Draft;
  warnings: (draft: Draft) => { source: string; missing: string; chapter: CustomCardChapter }[];
  Editor: ComponentType<
    Omit<ComponentProps<typeof CustomCardEditor>, 'draft' | 'patch'> & {
      frontStyle?: CardFrontStyle;
      draft: Draft;
      patch: (update: Partial<Draft>) => void;
    }
  >;
}): CardSessionConfig<Draft, CustomCardChapter, MemoryState<Draft, CustomCardMemory>, RememberEvent<CustomCardMemory>> {
  const { Editor, ...card } = layered;
  return {
    ...card,
    firstChapter: 'head',
    tokenIds: (draft) =>
      [...new Set(draft.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : [])))].sort(
        compareCodeUnits
      ),
    ...memoryDraftSession<Draft, CustomCardMemory>(card.schema, () => INITIAL_CUSTOM_CARD_MEMORY),
    renderEditor: ({ state, dispatch, tokens, tokensError, ...editor }) => (
      <Editor
        frontStyle={editor.frontStyle}
        tokens={tokens}
        tokensError={tokensError ?? null}
        tokenPicker={layeredCardTokenPicker}
        nameField={editor.nameField}
        draft={state.data}
        patch={editor.patch}
        memory={state.memory}
        remember={(update) => dispatch({ kind: 'remember', update })}
        chapter={editor.chapter}
        onChapterChange={editor.onChapterChange}
        onSettle={editor.onSettle}
      />
    ),
  };
}

export const customCardSession = layeredCardSession({
  type: 'card-custom',
  noun: 'custom card',
  schema: CustomCardAssetInput,
  storedSchema: CustomCardAsset,
  initialDraft: INITIAL_CUSTOM_CARD_DRAFT,
  warnings: customCardDraftWarnings,
  Editor: CustomCardEditor,
});

export const stormCardSession = layeredCardSession({
  type: 'card-storm',
  noun: 'storm card',
  schema: StormCardAssetInput,
  storedSchema: StormCardAsset,
  initialDraft: INITIAL_STORM_CARD_DRAFT,
  warnings: () => [],
  Editor: StormCardEditor,
});
