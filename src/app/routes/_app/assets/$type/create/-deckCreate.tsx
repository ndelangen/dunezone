import { Alert, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { DeckBackPicker, DeckBackProof } from '@app/pickers/DeckBackPicker';
import type { PickedBackDeck } from '@app/pickers/DeckBackPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  DeckEditor,
  INITIAL_DECK_DRAFT,
  deckDraftWarnings,
  initialDeckMemory,
} from '@app/widgets/deck-editor/DeckEditor';
import type { DeckChapter, DeckDraft, DeckMemory } from '@app/widgets/deck-editor/DeckEditor';
import { DeckAsset as DeckAssetSchema } from '@game/data/objects';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

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

/**
 * The deck create page.
 * Cards cannot be added here: membership is `asset_relations` rows keyed on the deck's id, and there is no id until the first save.
 * The Cards chapter says so rather than offering steppers that cannot write.
 */
export function DeckCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_DECK_DRAFT, INITIAL_DECK_DRAFT, null)
  );
  const patch = (update: Partial<DeckDraft>) => dispatch({ kind: 'patch', update });
  const pickless = state.data.cardback.mode === 'reference' && state.data.cardback.asset_id === null;
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    type: 'deck',
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Identity',
    chapter: 'identity' as DeckChapter,
  });
  const warnings: (
    | ReturnType<typeof deckDraftWarnings>[number]
    | { source: string; complaint: string; chapter: DeckChapter }
  )[] = [...deckDraftWarnings(state.data, []).filter((warning) => warning.chapter !== 'cards'), ...conflictWarnings];
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const isNameBlank = !state.data.name.trim();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });

  switch (viewer.kind) {
    case 'pending':
      return (
        <AssetEditorMessage title="New deck" type="deck">
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title="New deck" type="deck">
          <LoginGate action="create decks" />
        </AssetEditorMessage>
      );
    default:
      break;
  }

  const save = () => {
    /* Reference mode with nothing picked has no target to store, so the save says so with words rather than a Zod error. */
    dispatch({ kind: 'remember', update: { pickBlocked: pickless } });
    if (pickless) {
      return;
    }
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const payload = postedPayload(DeckAssetSchema, state.data);
    createAsset.mutate(
      /* The draft carries its mode, so the save writes it through; the strict stored union is the one truth («The stored shape of three back modes»). */
      { type: 'deck', data: payload },
      {
        onSuccess: ({ slug }) => {
          dispatch({ kind: 'saved', data: payload });
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'deck', slug }, replace: true });
        },
      }
    );
  };

  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty, isNameBlank, saveState }}
          copy={{
            saveLabel: 'Save deck',
            nameBlankMessage: 'Add a deck name before saving; it determines the deck URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline, pick: null })),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'deck' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
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
            members={[]}
            onCountChange={null}
            cardPicker={
              <Text size="xs" c="dimmed">
                Cards can be added once the deck has been saved.
              </Text>
            }
            backPicker={
              /*
               * Offered before the first save, unlike the members below it: a reference is a value the draft can
               * already hold, so nothing about it needs an id of our own. Cards, by contrast, are relation rows
               * written against a deck that does not exist yet, which is why that slot still waits.
               */
              <DeckBackPicker
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
