import { cardFrontStyleFor, newCardWithStandards } from '@shared/assets/cardFrontPresets';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useCardFrontPresets } from '@db/cardFrontPresets';
import type { AssetPublicPage } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import type { StoredShape } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import type { ValidationHeaderWarning } from '@app/widgets/authoring/ValidationHeader';

import { assetNameField } from '../assetEditorStates';
import { CardEditFrame, CardEditGate, useCardSave } from './$slug/edit/cardEditPage';
import type { CardEditSessionProps } from './$slug/edit/cardEditPage';
import { CardCreateFrame, useCardCreate } from './create/cardCreatePage';

/*
 * One card type's edit and create pages, driven by a config.
 * Before this, every card type copied the same session twice (edit and create): reducer, save, name field, header warnings, frame, editor.
 * A type now states only what is its own: its schema, starting draft, reducer, status, warnings and editor.
 */

type CardSessionType = Parameters<typeof useCardCreate>[0];

/** The state every card session keeps: the draft being edited and the last saved (or opening) draft it is compared with. */
export type DraftState<Draft> = { data: Draft; baseline: Draft };

/** The events every card session handles; a type may add its own, such as remembering a UI choice. */
export type DraftEvent<Draft> =
  | { kind: 'patch'; update: Partial<Draft> }
  | { kind: 'replace'; data: Draft }
  | { kind: 'saved'; data: Draft };

/** Whether the draft differs from its baseline, why it cannot be saved, and what a save would post. */
export type DraftStatus<Payload> = { isDirty: boolean; invalid?: string; payload: Payload | null | undefined };

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
  schema: z.ZodType<Draft>;
  /** A new card's draft, before the type's standard front is applied. */
  initialDraft: Draft;
  /** The chapter a session opens on, and returns to after a load. */
  firstChapter: Chapter;
  open: (data: Draft, baseline: Draft) => State;
  /** Handles the shared events, plus any the type adds. */
  reduce: (state: State, event: DraftEvent<Draft> | Extra) => State;
  /** A create page may ask more of a draft than an edit page, e.g. a nexus card needs its faction before it exists. */
  status: (state: State, mode: 'create' | 'edit') => DraftStatus<Draft>;
  warnings: (draft: Draft) => (ValidationHeaderWarning & { chapter: Chapter })[];
  renderEditor: (slot: CardEditorSlot<Draft, Chapter, State, DraftEvent<Draft> | Extra>) => ReactNode;
}

/** The reducer and status for a type whose state is only its draft and baseline. */
export function plainDraftSession<Draft extends { name: string }>(schema: z.ZodType<Draft> & StoredShape) {
  return {
    open: (data: Draft, baseline: Draft): DraftState<Draft> => ({ data, baseline }),
    reduce: (state: DraftState<Draft>, event: DraftEvent<Draft>): DraftState<Draft> => {
      switch (event.kind) {
        case 'patch':
          return { ...state, data: { ...state.data, ...event.update } };
        /* Loading and Reset replace the whole draft while keeping the saved baseline. */
        case 'replace':
          return { data: event.data, baseline: state.baseline };
        /* A completed save moves the baseline to the payload that was posted. */
        case 'saved':
          return { ...state, baseline: event.data };
      }
    },
    status: (state: DraftState<Draft>): DraftStatus<Draft> => {
      const validation = schema.safeParse(state.data);
      return {
        payload: validation.success ? postedPayload(schema, state.data) : undefined,
        invalid: validation.success ? undefined : validation.error.issues[0]?.message,
        isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
      };
    },
  };
}

function useCardSession<Draft extends { name: string }, Chapter, State extends DraftState<Draft>, Extra = never>(
  config: CardSessionConfig<Draft, Chapter, State, Extra>,
  opening: () => State
) {
  const [chapter, setChapter] = useState<Chapter>(config.firstChapter);
  const [state, dispatch] = useReducer(config.reduce, undefined, opening);
  const patch = (update: Partial<Draft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: config.warnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  return { chapter, setChapter, state, dispatch, patch, header };
}

/** A card type's edit page. Mounted by the generic `$type/$slug/edit` route. */
export function CardTypeEditPage<
  Draft extends { name: string },
  Chapter,
  State extends DraftState<Draft>,
  Extra = never,
>({
  config,
  slug,
  loaderData,
}: Readonly<{ config: CardSessionConfig<Draft, Chapter, State, Extra>; slug: string; loaderData: AssetPublicPage }>) {
  return (
    <CardEditGate
      type={config.type}
      schemaName={config.noun}
      schema={config.schema}
      slug={slug}
      loaderData={loaderData}
      session={(props) => <CardEditSession config={config} {...props} />}
    />
  );
}

function CardEditSession<Draft extends { name: string }, Chapter, State extends DraftState<Draft>, Extra = never>({
  config,
  frontPresets,
  asset,
  initialDraft,
  access,
}: Readonly<CardEditSessionProps<Draft> & { config: CardSessionConfig<Draft, Chapter, State, Extra> }>) {
  const saving = useCardSave(config.type, asset);
  const session = useCardSession(config, () => config.open(initialDraft, initialDraft));
  const { state, dispatch, patch, header } = session;
  const { isDirty, invalid, payload } = config.status(state, 'edit');
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
        schema: config.schema,
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
          noun: 'card',
        }),
        state,
        dispatch,
        patch,
        chapter: session.chapter,
        onChapterChange: session.setChapter,
        onSettle: header.settle,
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
  const frontPresets = useCardFrontPresets();
  const saving = useCardCreate(config.type);
  const session = useCardSession(config, () =>
    config.open(
      newCardWithStandards(config.type, config.initialDraft),
      newCardWithStandards(config.type, config.initialDraft)
    )
  );
  const { state, dispatch, patch, header } = session;
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
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState, invalid }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: config.schema,
        onLoaded: header.releasing((data: Draft) => {
          dispatch({ kind: 'replace', data });
          session.setChapter(config.firstChapter);
        }),
      }}
      saveError={saving.error}
    >
      {config.renderEditor({
        frontStyle: cardFrontStyleFor(config.type, state.data, frontPresets ?? []),
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
      })}
    </CardCreateFrame>
  );
}
