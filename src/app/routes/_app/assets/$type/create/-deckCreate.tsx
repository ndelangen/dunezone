import { Alert, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { DeckBackPicker, DeckBackProof } from '@app/pickers/DeckBackPicker';
import type { PickedBackDeck } from '@app/pickers/DeckBackPicker';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeader } from '@app/widgets/authoring/useValidationHeader';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { DeckEditor, INITIAL_DECK_DRAFT, deckDraftWarnings } from '@app/widgets/deck-editor/DeckEditor';
import type { DeckChapter, DeckDraft } from '@app/widgets/deck-editor/DeckEditor';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'deck-validation-header';

/**
 * The deck create page.
 * Cards cannot be added here: membership is `asset_relations` rows keyed on the deck's id, and there is no id until the first save.
 * The Cards chapter says so rather than offering steppers that cannot write.
 */
export function DeckCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [draft, setDraft] = useState<DeckDraft>(INITIAL_DECK_DRAFT);
  /* The chosen deck, kept beside the draft: the draft carries the id that reaches storage; this carries the name and face the tile draws. */
  const [pickedBackDeck, setPickedBackDeck] = useState<PickedBackDeck | null>(null);
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  /* Armed by a save attempt while the reference has no target; disarmed the moment the state resolves. */
  const [pickBlocked, setPickBlocked] = useState(false);
  const patch = (update: Partial<DeckDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const pickless = draft.cardback.mode === 'reference' && draft.cardback.asset_id === null;
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'deck',
    name: draft.name,
    onName: (name) => patch({ name }),
    source: 'Identity',
    chapter: 'identity' as DeckChapter,
  });
  const warnings: (
    | ReturnType<typeof deckDraftWarnings>[number]
    | { source: string; complaint: string; chapter: DeckChapter }
  )[] = [...deckDraftWarnings(draft, []).filter((warning) => warning.chapter !== 'cards'), ...conflictWarnings];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_DECK_DRAFT);
  const isNameBlank = !draft.name.trim();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const validationHeader = useValidationHeader(warnings.length);

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
    if (pickless) {
      setPickBlocked(true);
      return;
    }
    setPickBlocked(false);
    createAsset.mutate(
      /* The draft carries its mode, so the save writes it through; the strict stored union is the one truth («The stored shape of three back modes»). */
      { type: 'deck', data: draft },
      {
        onSuccess: ({ slug }) =>
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'deck', slug }, replace: true }),
      }
    );
  };

  return (
    <PageLayout>
      {validationHeader.open ? (
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
            onReset: validationHeader.releasing(() => {
              setDraft(INITIAL_DECK_DRAFT);
              /* The pick and the armed alert ride beside the draft, so a reset drops all three, the way the edit page's does. */
              setPickedBackDeck(null);
              setPickBlocked(false);
            }),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'deck' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          {pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No deck picked">
              Pick a deck whose cardback this one wears, or choose another back mode.
            </Alert>
          ) : null}
          <DeckEditor
            nameField={nameField}
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={validationHeader.settle}
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
                picked={pickedBackDeck}
                onPick={(deck) => {
                  /* A pick is a draft edit, not a write; the reference reaches storage when the deck is saved. */
                  setPickedBackDeck(deck);
                  patch({ cardback: { mode: 'reference', asset_id: deck.id } });
                }}
              />
            }
            backProof={<DeckBackProof picked={pickedBackDeck} />}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
