import { Alert, Popover } from '@mantine/core';
import { DeckAsset } from '@shared/assets/schema';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import { useNavigate } from '@tanstack/react-router';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { FilePlus2 } from 'lucide-react';
import { useReducer, useState } from 'react';

import { useAssetPage, useSetMemberCount, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { mutationErrorMessage } from '@app/db/core/mutationError';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { DeckBackPicker, DeckBackProof } from '@app/pickers/DeckBackPicker';
import type { PickedBackDeck } from '@app/pickers/DeckBackPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeader } from '@app/widgets/authoring/useValidationHeader';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { DeckEditor, deckDraftWarnings, initialDeckMemory } from '@app/widgets/deck-editor/DeckEditor';
import type {
  DeckChapter,
  DeckDraft,
  DeckDraftCardback,
  DeckMemory,
  DeckWarning,
} from '@app/widgets/deck-editor/DeckEditor';
import { DeckAsset as DeckAssetSchema } from '@game/data/objects';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
  useAssetNameField,
} from '../../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'deck-validation-header';

/**
 * Every card type a deck may hold, derived so it grows with the registry rather than with this file.
 * It had been a hand-written `['card-treachery']` under a comment claiming exactly this derivation, which is the shape that put a live Asset type on no landing pile earlier today: a second answer does not merely drift, it asserts the first one's job.
 * Planned types are included deliberately, since `AssetPicker` can only offer assets that exist and a type with none contributes nothing.
 */
const CARD_TYPES = ASSET_TYPE_KEYS.filter((type) => ASSET_TYPES[type].category === 'cards');

export function DeckEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  const query = useAssetPage('deck', slug, { initialData: loaderData });
  const data = query.data ?? loaderData;

  if (data === null) {
    return (
      <AssetEditorMessage title="Edit deck" type="deck">
        <NotAvailable title="Deck not found">No deck lives at this address.</NotAvailable>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="deck">
        <LoginGate action="edit decks" />
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="deck">
        <NotAvailable title="You cannot edit this deck">
          {data.viewerAccess.assignedGroup
            ? 'Only the deck owner or an active member of its group can edit this deck.'
            : 'Only the deck owner can edit this deck.'}
        </NotAvailable>
      </AssetEditorMessage>
    );
  }

  const parsed = DeckAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="deck" canDelete={data.viewerAccess.capabilities.delete}>
        {`This deck's stored data no longer matches the deck schema, so it cannot be edited here.`}
      </DriftedAssetPage>
    );
  }

  /*
   * The parse boundary flattens the transitional bare shape: the 'in'-narrow derives the reference
   * member, everything else re-tags as the draft's custom member, and the editor never learns the
   * third, transitional member the stored union still carries until the narrow.
   */
  const cardback = parsed.data.cardback;
  const initialCardback: DeckDraftCardback =
    'mode' in cardback && cardback.mode === 'reference' ? cardback : { ...cardback, mode: 'custom' };

  return (
    <DeckEditSession
      key={data.asset.id}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
      asset={data.asset}
      members={data.members}
      backDeck={data.backDeck}
      danglingBack={data.resolvedBack?.mode === 'dangling'}
      initialDraft={{ ...parsed.data, cardback: initialCardback }}
    />
  );
}

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design, because the generic version cost more than the duplication it removed.
 * `memory` is what the session needs and the stored deck has no room for (D3): the declared Custom intents, the composition kept across mode flips, the picked deck the tile draws, and whether a save has already complained.
 * `baseline` is what a reset returns to.
 */
type DeckPageMemory = DeckMemory & { pickedBackDeck: PickedBackDeck | null; pickBlocked: boolean };

type DeckState = { data: DeckDraft; memory: DeckPageMemory; baseline: DeckDraft };

type DeckEvent =
  | { kind: 'patch'; update: Partial<DeckDraft> }
  | { kind: 'remember'; update: Partial<DeckPageMemory> }
  | { kind: 'replace'; data: DeckDraft; pick: PickedBackDeck | null }
  | { kind: 'saved'; data: DeckDraft };

function openingState(data: DeckDraft, baseline: DeckDraft, pick: PickedBackDeck | null): DeckState {
  return {
    data,
    memory: { ...initialDeckMemory(data.cardback), pickedBackDeck: pick, pickBlocked: false },
    baseline,
  };
}

function reduce(state: DeckState, event: DeckEvent): DeckState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets; the seed pick rides on the event because the reducer holds no closure. */
    case 'replace':
      return openingState(event.data, state.baseline, event.pick);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

function DeckEditSession({
  access,
  asset,
  members,
  backDeck,
  danglingBack,
  initialDraft,
}: {
  access: {
    viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
    assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
  };
  asset: NonNullable<AssetPageData>['asset'];
  members: NonNullable<AssetPageData>['members'];
  backDeck: NonNullable<AssetPageData>['backDeck'];
  /** The server judged the stored reference dangling; the route only relays the complaint. */
  danglingBack: boolean;
  initialDraft: DeckDraft;
}) {
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const setCount = useSetMemberCount();
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  const [pickerOpen, setPickerOpen] = useState(false);
  /*
   * Server truth seeds the picked deck and a pick replaces it; the draft holds only the id, and this holds the name and face the tile draws.
   * A reset returns it to that same server truth, which is why the seed rides on the replace event.
   */
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft, backDeck));
  const patch = (update: Partial<DeckDraft>) => dispatch({ kind: 'patch', update });
  const cards = members.map((entry) => ({ card: entry.member, count: entry.count }));
  /*
   * The dangling complaint rides the widened validation header beside the widget's own warnings
   * («How a dangling back reference presents»), routed to Identity, the chapter the back tiles live in.
   */
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'deck',
    name: state.data.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Identity',
    chapter: 'identity' as DeckChapter,
  });
  const warnings: (DeckWarning | { source: string; complaint: string; chapter: DeckChapter })[] = [
    ...deckDraftWarnings(state.data, cards),
    ...conflictWarnings,
    ...(danglingBack && state.data.cardback.mode === 'reference'
      ? [{ source: 'Cardback', complaint: 'its referenced cardback is gone', chapter: 'identity' as DeckChapter }]
      : []),
  ];
  const pickless = state.data.cardback.mode === 'reference' && state.data.cardback.asset_id === null;
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const isNameBlank = !state.data.name.trim();
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const header = useValidationHeader(warnings.length);

  const save = () => {
    /* A pickless reference is blocked here with words, rather than letting the strict stored union answer with a Zod error. */
    dispatch({ kind: 'remember', update: { pickBlocked: pickless } });
    if (pickless) {
      return;
    }
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const saved = postedPayload(DeckAssetSchema, state.data);
    updateAsset.mutate(
      /* The draft carries its mode, so the save writes it through; the strict stored union is the one truth («The stored shape of three back modes»). */
      { id: asset.id, data: saved },
      {
        onSuccess: ({ slug: nextSlug }) => {
          dispatch({ kind: 'saved', data: saved });
          if (nextSlug !== asset.slug) {
            void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'deck', slug: nextSlug }, replace: true });
          }
        },
      }
    );
  };

  return (
    <PageLayout>
      {header.open ? (
        <PageLayout.Header size="compact">
          <ValidationHeader
            id={VALIDATION_HEADER_ID}
            warnings={warnings}
            onFocusWarning={(warning) => setChapter(warning.chapter)}
          />
        </PageLayout.Header>
      ) : null}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty, isNameBlank, saveState }}
          copy={{
            saveLabel: 'Save deck',
            nameBlankMessage: 'Add a deck name before saving; it determines the deck URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline, pick: backDeck })),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'deck' } }),
          }}
          auxiliaryActions={
            <>
              {/*
               * Making a card leaves this page, so it belongs with the page-level actions rather than inside the
               * chapter it serves, and it stays disabled while there is anything to lose (Norbert, 2026-08-20).
               * `FilePlus2` rather than a plain plus: every other toolbar's plus creates one of the things the page
               * lists, and this one creates something else entirely.
               */}
              <IconAction
                label="Create a new card"
                tooltip={
                  isDirty
                    ? 'Save your deck first, since creating a card leaves this page'
                    : 'Create a new card, then come back and add it'
                }
                variant="light"
                color="gray"
                size="lg"
                disabled={isDirty}
                onClick={() => void navigate({ to: '/assets/$type/create', params: { type: 'card-treachery' } })}
                icon={<FilePlus2 size={17} aria-hidden />}
              />
              {groupActions.auxiliaryActions}
            </>
          }
          context={groupActions.context}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <ConfirmDeleteAction label="Delete deck" pending={deletion.pending} onConfirm={deletion.confirm} />
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={updateAsset.error} />
          {deletion.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deletion.error.message}
            </Alert>
          ) : null}
          {groupActions.error}
          {setCount.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not change the composition">
              {mutationErrorMessage(setCount.error)}
            </Alert>
          ) : null}
          {state.memory.pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No deck picked">
              Pick a deck whose cardback this one wears, or choose another back mode.
            </Alert>
          ) : null}
          <DeckEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
            members={cards}
            countPending={setCount.isPending}
            onCountChange={header.releasing((cardId: string, count: number) =>
              setCount.mutate({ container_id: asset.id, member_id: cardId as typeof asset.id, count })
            )}
            cardPicker={
              <Popover opened={pickerOpen} onChange={setPickerOpen} width={360} position="bottom-start" withinPortal>
                <Popover.Target>
                  {/* The same small green plus nine other controls grow a collection with, so a picker reads as an add rather than as a banner. */}
                  <AddAction label="Add a card" onClick={() => setPickerOpen((open) => !open)} />
                </Popover.Target>
                <Popover.Dropdown>
                  <AssetPicker
                    types={CARD_TYPES}
                    excludeIds={cards.map((entry) => entry.card.id)}
                    copy={{
                      searchLabel: 'Search cards',
                      searchPlaceholder: 'Type a name, slug or owner…',
                      emptyMessage: 'No cards exist yet.',
                    }}
                    onPick={(picked) => {
                      setPickerOpen(false);
                      setCount.mutate({ container_id: asset.id, member_id: picked.id, count: 1 });
                    }}
                    onCancel={() => setPickerOpen(false)}
                  />
                </Popover.Dropdown>
              </Popover>
            }
            backPicker={
              <DeckBackPicker
                excludeId={asset.id}
                picked={state.memory.pickedBackDeck}
                onPick={(deck) => {
                  /* A pick is a draft edit, not a write; the reference reaches storage when the deck is saved. */
                  dispatch({ kind: 'remember', update: { pickedBackDeck: deck } });
                  patch({ cardback: { mode: 'reference', asset_id: deck.id } });
                }}
              />
            }
            backProof={<DeckBackProof picked={state.memory.pickedBackDeck} />}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
