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
import { cardEditorProps, memoryEditorProps } from './cardSession';
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
  input: TreacheryAsset,
  initialDraft: INITIAL_TREACHERY_DRAFT,
  firstChapter: 'head',
  ...treacheryDrafts,
  warnings: treacheryDraftWarnings,
  renderEditor: (slot) => <TreacheryCardEditor {...cardEditorProps(slot)} {...memoryEditorProps(slot)} />,
};

/* A spice card has no background composer, so there is no session memory beside the draft. */
export const spiceCardSession: CardSessionConfig<SpiceDraft, SpiceChapter, DraftState<SpiceDraft>> = {
  type: 'card-spice',
  noun: 'spice card',
  input: SpiceAsset,
  initialDraft: INITIAL_SPICE_DRAFT,
  firstChapter: 'identity',
  ...plainDraftSession<SpiceDraft>(SpiceAsset),
  warnings: spiceDraftWarnings,
  renderEditor: (slot) => {
    const { frontStyle: _noFront, ...editor } = cardEditorProps(slot);
    return (
      <SpiceBoardRead
        draft={editor.draft}
        render={(boardRead) => (
          <SpiceCardEditor
            {...editor}
            boardRead={boardRead}
            boardSelect={spiceBoardSelect}
            tokenPicker={layeredCardTokenPicker}
          />
        )}
      />
    );
  },
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
  input: LeaderSkillAssetInput,
  stored: LeaderSkillAsset,
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
  renderEditor: (slot) => (
    <LeaderSkillCardEditor
      {...cardEditorProps(slot)}
      {...memoryEditorProps(slot)}
      onOverflow={(overflow) => slot.dispatch({ kind: 'overflow', overflow })}
    />
  ),
};

export const homeworldCardSession: CardSessionConfig<HomeworldDraft, HomeworldChapter, DraftState<HomeworldDraft>> = {
  type: 'card-homeworld',
  noun: 'homeworld card',
  input: HomeworldCardAssetInput,
  initialDraft: EMPTY_HOMEWORLD_CARD,
  firstChapter: 'head',
  ...plainDraftSession<HomeworldDraft>(HomeworldCardAssetInput),
  warnings: homeworldDraftWarnings,
  renderEditor: (slot) => <HomeworldCardEditor {...cardEditorProps(slot)} />,
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
  input: NexusCardAssetInput,
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
  renderEditor: (slot) => <NexusCardEditor {...cardEditorProps(slot)} {...memoryEditorProps(slot)} />,
};

export const strongholdCardSession: CardSessionConfig<
  StrongholdDraft,
  StrongholdChapter,
  DraftState<StrongholdDraft>
> = {
  type: 'card-stronghold',
  noun: 'stronghold card',
  input: StrongholdCardAssetInput,
  initialDraft: INITIAL_STRONGHOLD_DRAFT,
  firstChapter: 'head',
  ...plainDraftSession<StrongholdDraft>(StrongholdCardAssetInput),
  warnings: strongholdDraftWarnings,
  renderEditor: (slot) => <StrongholdCardEditor {...cardEditorProps(slot)} />,
};

export const leaderTokenSession: CardSessionConfig<
  LeaderTokenDraft,
  LeaderTokenChapter,
  MemoryState<LeaderTokenDraft, LeaderTokenMemory>,
  RememberEvent<LeaderTokenMemory>
> = {
  type: 'token-leader',
  noun: 'leader token',
  input: LeaderTokenAssetInput,
  initialDraft: EMPTY_LEADER_TOKEN,
  firstChapter: 'identity',
  loadPresets: [{ label: 'Duke Prad Vidal', name: DUKE_PRAD_VIDAL_TOKEN.name, data: DUKE_PRAD_VIDAL_TOKEN }],
  ...memoryDraftSession<LeaderTokenDraft, LeaderTokenMemory>(LeaderTokenAssetInput, () => ({
    declaredCustom: false,
    backgroundMode: emptyBackgroundModeMemory(),
    refusedStrength: null,
  })),
  warnings: leaderTokenDraftWarnings,
  /* A leader token has no card front, so its editor takes everything but the front style. */
  renderEditor: (slot) => {
    const { frontStyle: _noFront, ...editor } = cardEditorProps(slot);
    return <LeaderTokenEditor {...editor} {...memoryEditorProps(slot)} />;
  },
};

type LayeredCardDraft = Pick<z.infer<typeof CustomCardAsset>, 'name' | 'about' | 'layers'>;

/** The custom and storm cards share one editor shape: free layers, some of them placed tokens whose faces the page reads. */
function layeredCardSession<Draft extends LayeredCardDraft>(layered: {
  type: 'card-custom' | 'card-storm';
  noun: string;
  input: z.ZodType<Draft> & StoredShape;
  stored: z.ZodType<Draft>;
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
    ...memoryDraftSession<Draft, CustomCardMemory>(card.input, () => INITIAL_CUSTOM_CARD_MEMORY),
    renderEditor: (slot) => (
      <Editor
        {...cardEditorProps(slot)}
        {...memoryEditorProps(slot)}
        tokens={slot.tokens}
        tokensError={slot.tokensError ?? null}
        tokenPicker={layeredCardTokenPicker}
      />
    ),
  };
}

export const customCardSession = layeredCardSession({
  type: 'card-custom',
  noun: 'custom card',
  input: CustomCardAssetInput,
  stored: CustomCardAsset,
  initialDraft: INITIAL_CUSTOM_CARD_DRAFT,
  warnings: customCardDraftWarnings,
  Editor: CustomCardEditor,
});

export const stormCardSession = layeredCardSession({
  type: 'card-storm',
  noun: 'storm card',
  input: StormCardAssetInput,
  stored: StormCardAsset,
  initialDraft: INITIAL_STORM_CARD_DRAFT,
  warnings: () => [],
  Editor: StormCardEditor,
});
