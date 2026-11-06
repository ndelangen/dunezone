import { cardFrontStyleFor, newCardWithStandards } from '@shared/assets/cardFrontPresets';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useAuthoringPresets } from '@db/backgroundPresets';
import { useAssetPage } from '@app/db/assets';
import type { AssetPageData, AssetPublicPage } from '@app/db/assets';
import type { LoadPreset } from '@app/pickers/assetLoadSource';
import type { StoredShape } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import type { ValidationHeaderWarning } from '@app/widgets/authoring/ValidationHeader';

import { assetNameField } from '../assetEditorStates';
import { CardEditChecks, CardEditFrame, useCardSave } from './$slug/edit/cardEditPage';
import type { CardEditSessionProps } from './$slug/edit/cardEditPage';
import type { DraftEvent, DraftState, DraftStatus } from './cardDrafts';
import { CardCreateFrame, useCardCreate } from './create/cardCreatePage';

/*
 * Every card type's edit and create pages, driven by a config.
 * Before this, every card type copied the same session twice (edit and create): reducer, save, name field, header warnings, frame, editor.
 * A type now states only what is its own: its schemas, starting draft, reducer, status, warnings and editor.
 */

type CardSessionType = Parameters<typeof useCardCreate>[0];

type CardTokens = NonNullable<AssetPageData>['cardTokens'];

/** What the type's editor is handed. */
type CardEditorSlot<Draft, Chapter, State, Event> = {
  frontStyle: CardFrontStyle | undefined;
  nameField: ReactNode;
  state: State;
  dispatch: (event: Event) => void;
  patch: (update: Partial<Draft>) => void;
  chapter: Chapter;
  onChapterChange: (chapter: Chapter) => void;
  onSettle: () => void;
  /** The faces of the tokens the draft places, for a type that names `tokenIds`. */
  tokens: NonNullable<CardTokens>;
  tokensError: string | null | undefined;
};

export interface CardSessionConfig<
  Draft extends { name: string },
  Chapter,
  State extends DraftState<Draft>,
  Extra = never,
> {
  type: CardSessionType;
  /** How the pages name this type, e.g. "nexus card"; the create page is titled "New nexus card". */
  noun: string;
  /** What a save posts, and what the create page loads. */
  schema: z.ZodType<Draft> & StoredShape;
  /** What a stored card must still match to open in the editor, when that is stricter or looser than `schema`. */
  storedSchema?: z.ZodType<Draft>;
  /** A new card's draft, before the type's standard front is applied. */
  initialDraft: Draft;
  /** The chapter a session opens on, and returns to after a load. */
  firstChapter: Chapter;
  /** Ready-made drafts the Load menu offers beside the viewer's own cards. */
  loadPresets?: LoadPreset<Draft>[];
  /** The tokens a draft places, whose faces the page reads alongside the card. */
  tokenIds?: (draft: Draft) => string[];
  open: (data: Draft, baseline: Draft) => State;
  /** Handles the shared events, plus any the type adds. */
  reduce: (state: State, event: DraftEvent<Draft> | Extra) => State;
  /** A create page may ask more of a draft than an edit page, e.g. a nexus card needs its faction before it exists. */
  status: (state: State, mode: 'create' | 'edit') => DraftStatus<Draft>;
  warnings: (draft: Draft) => (ValidationHeaderWarning & { chapter: Chapter })[];
  renderEditor: (slot: CardEditorSlot<Draft, Chapter, State, DraftEvent<Draft> | Extra>) => ReactNode;
}

function useCardSession<Draft extends { name: string }, Chapter, State extends DraftState<Draft>, Extra>(
  config: CardSessionConfig<Draft, Chapter, State, Extra>,
  state: State,
  dispatch: (event: DraftEvent<Draft> | Extra) => void
) {
  const [chapter, setChapter] = useState<Chapter>(config.firstChapter);
  const patch = (update: Partial<Draft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: config.warnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  return { chapter, setChapter, patch, header };
}

type OpenEvent<State> = { kind: 'open'; state: State };

/** The edit page's reducer: empty until the stored card is first read, then the type's own. */
function reduceOpened<State, Event>(reduce: (state: State, event: Event) => State) {
  return (state: State | null, event: Event | OpenEvent<State>): State | null => {
    const opening = event as Partial<OpenEvent<State>>;
    if (opening.kind === 'open' && opening.state) {
      return state ?? opening.state;
    }
    return state ? reduce(state, event as Event) : null;
  };
}

/** A card type's edit page. Mounted by the generic `$type/$slug/edit` route. */
export function CardTypeEditPage<
  Draft extends { name: string },
  Chapter,
  State extends DraftState<Draft>,
  Extra = never,
>(
  props: Readonly<{
    config: CardSessionConfig<Draft, Chapter, State, Extra>;
    slug: string;
    loaderData: AssetPublicPage;
  }>
) {
  /* Keyed on the card rather than its address, so a rename keeps the session while moving to another card opens a fresh one. */
  return <CardEditSessionGate key={`${props.config.type}/${props.loaderData?.asset.id ?? props.slug}`} {...props} />;
}

/**
 * The page owns the draft above the checks, because a type's unsaved token placements decide what the live read asks for.
 * The draft opens once from the first read that parses.
 * Later reads never replace local edits.
 */
function CardEditSessionGate<Draft extends { name: string }, Chapter, State extends DraftState<Draft>, Extra>({
  config,
  slug,
  loaderData,
}: Readonly<{ config: CardSessionConfig<Draft, Chapter, State, Extra>; slug: string; loaderData: AssetPublicPage }>) {
  const storedSchema = config.storedSchema ?? config.schema;
  const opening = (data: unknown) => {
    const parsed = storedSchema.safeParse(data);
    return parsed.success ? config.open(parsed.data, parsed.data) : null;
  };
  const [state, dispatch] = useReducer(reduceOpened(config.reduce), undefined, () => opening(loaderData?.asset.data));
  const query = useAssetPage(config.type, slug, {
    initialData: loaderData,
    embeddedTokenIds: state && config.tokenIds ? config.tokenIds(state.data) : undefined,
  });
  const data = query.data;
  if (!state && data) {
    const opened = opening(data.asset.data);
    if (opened) {
      dispatch({ kind: 'open', state: opened });
    }
  }
  return (
    <CardEditChecks
      type={config.type}
      schemaName={config.noun}
      schema={storedSchema}
      data={data}
      session={(props) =>
        state ? <CardEditSession config={config} {...props} state={state} dispatch={dispatch} /> : null
      }
    />
  );
}

function CardEditSession<Draft extends { name: string }, Chapter, State extends DraftState<Draft>, Extra>({
  config,
  frontPresets,
  asset,
  access,
  tokens,
  tokensError,
  state,
  dispatch,
}: Readonly<
  CardEditSessionProps<Draft> & {
    config: CardSessionConfig<Draft, Chapter, State, Extra>;
    state: State;
    dispatch: (event: DraftEvent<Draft> | Extra) => void;
  }
>) {
  const saving = useCardSave(config.type, asset);
  const session = useCardSession(config, state, dispatch);
  const { patch, header } = session;
  const status = config.status(state, 'edit');
  const { isDirty, payload } = status;
  /* A placed token whose face cannot be read blocks the save, as the card's own validation does. */
  const invalid = (config.tokenIds ? tokensError : undefined) ?? status.invalid;
  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
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
      load={{
        schema: config.storedSchema ?? config.schema,
        presets: config.loadPresets,
        header,
        dispatch,
        afterLoad: () => session.setChapter(config.firstChapter),
      }}
      saveError={saving.error}
    >
      {config.renderEditor({
        frontStyle: cardFrontStyleFor(config.type, state.data, frontPresets),
        nameField: assetNameField({
          name: state.data.name,
          onName: (name) => patch({ name } as Partial<Draft>),
          canRename: access.viewerAccess.capabilities.rename,
          noun: config.type === 'token-leader' ? 'token' : 'card',
        }),
        state,
        dispatch,
        patch,
        chapter: session.chapter,
        onChapterChange: session.setChapter,
        onSettle: header.settle,
        tokens: tokens ?? {},
        tokensError,
      })}
    </CardEditFrame>
  );
}

/** A card type's create page. Mounted by the generic `$type/create` route. */
export function CardTypeCreatePage<
  Draft extends { name: string },
  Chapter,
  State extends DraftState<Draft>,
  Extra = never,
>({ config }: Readonly<{ config: CardSessionConfig<Draft, Chapter, State, Extra> }>) {
  const saving = useCardCreate(config.type);
  const [state, dispatch] = useReducer(config.reduce, undefined, () =>
    config.open(
      newCardWithStandards(config.type, config.initialDraft),
      newCardWithStandards(config.type, config.initialDraft)
    )
  );
  const session = useCardSession(config, state, dispatch);
  const { patch, header } = session;
  /* The design standards, plus the faces of any tokens the draft places; they stay visible while a changed placement loads. */
  const standards = useAuthoringPresets(config.tokenIds?.(state.data));
  const { isDirty, invalid, payload } = config.status(state, 'create');
  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };

  return (
    <CardCreateFrame
      type={config.type}
      title={`New ${config.noun}`}
      loadingPresets={!standards}
      backgrounds={standards?.backgrounds ?? []}
      fronts={standards?.fronts ?? []}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: config.schema,
        presets: config.loadPresets,
        onLoaded: header.releasing((data: Draft) => {
          dispatch({ kind: 'replace', data });
          session.setChapter(config.firstChapter);
        }),
      }}
      saveError={saving.error}
    >
      {config.renderEditor({
        frontStyle: cardFrontStyleFor(config.type, state.data, standards?.fronts ?? []),
        nameField: assetNameField({
          /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
          canRename: true,
          name: state.data.name,
          onName: (name) => patch({ name } as Partial<Draft>),
        }),
        state,
        dispatch,
        patch,
        chapter: session.chapter,
        onChapterChange: session.setChapter,
        onSettle: header.settle,
        tokens: standards?.tokens ?? {},
        tokensError: standards?.error,
      })}
    </CardCreateFrame>
  );
}
