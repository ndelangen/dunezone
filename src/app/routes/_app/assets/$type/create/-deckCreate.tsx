import { Alert, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { DeckBackPicker, DeckBackProof } from '@app/pickers/DeckBackPicker';
import type { PickedBackDeck } from '@app/pickers/DeckBackPicker';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useAuthoringEnvelope, useAuthoringSession } from '@app/widgets/authoring/useAuthoringSession';
import {
  deckDraftWarnings,
  DeckEditor,
  INITIAL_DECK_DRAFT,
  initialDeckMemory,
} from '@app/widgets/deck-editor/DeckEditor';
import type { DeckChapter } from '@app/widgets/deck-editor/DeckEditor';
import { DeckAsset as DeckAssetSchema } from '@game/data/objects';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'deck-validation-header';

/** The deck create page. Mounted by the generic `$type/create` route when the type is `deck`. */
export function DeckCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  /*
   * The picked deck and the armed alert ride in the session's memory rather than beside the draft.
   * The draft carries the id that reaches storage; memory carries the name and face the tile draws, and whether a save has already complained.
   * Both reset with the draft because the envelope replaces whole (D3 on «Work the editors wave»).
   */
  const envelope = useAuthoringEnvelope({
    initialData: INITIAL_DECK_DRAFT,
    initialMemory: {
      ...initialDeckMemory(INITIAL_DECK_DRAFT.cardback),
      pickedBackDeck: null as PickedBackDeck | null,
      pickBlocked: false,
    },
  });
  const pickless = envelope.draft.cardback.mode === 'reference' && envelope.draft.cardback.asset_id === null;
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'deck',
    name: envelope.draft.name,
    onName: (name) => envelope.patch({ name }),
    source: 'Identity',
    chapter: 'identity' as DeckChapter,
  });
  const warnings = [
    ...deckDraftWarnings(envelope.draft, []).filter((warning) => warning.chapter !== 'cards'),
    ...conflictWarnings,
  ];
  const session = useAuthoringSession({
    envelope,
    warnings,
    schema: DeckAssetSchema,
    mutation: createAsset,
    /* The draft carries its mode, so the save writes it through; the strict stored union is the one truth («The stored shape of three back modes»). */
    variables: (payload) => ({ type: 'deck', data: payload }),
    validationHeaderId: VALIDATION_HEADER_ID,
    onFocusWarning: (warning) => setChapter(warning.chapter),
    onSaved: ({ slug }) =>
      void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'deck', slug }, replace: true }),
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

  /* Reference mode with nothing picked has no target to store, so the save says so with words rather than a Zod error. */
  const save = () => {
    envelope.remember({ pickBlocked: pickless });
    if (!pickless) {
      session.actions.save();
    }
  };

  return (
    <PageLayout>
      {session.band}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={session.status}
          copy={{
            saveLabel: 'Save deck',
            nameBlankMessage: 'Add a deck name before saving; it determines the deck URL.',
          }}
          actions={{
            onSave: save,
            onReset: session.actions.reset,
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'deck' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          {envelope.memory.pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No deck picked">
              Pick a deck whose cardback this one wears, or choose another back mode.
            </Alert>
          ) : null}
          <DeckEditor
            nameField={nameField}
            {...session.editorProps}
            chapter={chapter}
            onChapterChange={setChapter}
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
                picked={envelope.memory.pickedBackDeck}
                onPick={(deck) => {
                  /* A pick is a draft edit, not a write; the reference reaches storage when the deck is saved. */
                  envelope.remember({ pickedBackDeck: deck });
                  envelope.patch({ cardback: { mode: 'reference', asset_id: deck.id } });
                }}
              />
            }
            backProof={<DeckBackProof picked={envelope.memory.pickedBackDeck} />}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
