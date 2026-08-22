import { Alert, Anchor, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useCurrentProfile } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { AssetFace, assetFaceAspect } from '@app/widgets/asset-face/AssetFace';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
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
  const profile = useCurrentProfile();
  const createAsset = useCreateAsset();
  const [draft, setDraft] = useState<DeckDraft>(INITIAL_DECK_DRAFT);
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  /* Armed by a save attempt while the reference has no target; disarmed the moment the state resolves. */
  const [pickBlocked, setPickBlocked] = useState(false);
  const [backPickerOpen, setBackPickerOpen] = useState(false);
  const [pickedBackDeck, setPickedBackDeck] = useState<{ name: string; data: unknown } | null>(null);
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
  const validationHeaderOpen = useValidationHeaderOpen(warnings.length, settleTick);

  if (profile.data === null) {
    return (
      <AssetEditorMessage title="New deck" type="deck">
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to create decks.
        </Text>
      </AssetEditorMessage>
    );
  }

  const save = () => {
    /* Reference mode with nothing picked has no href to publish, so the save says so with words rather than a Zod error. */
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
      {validationHeaderOpen ? (
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
            onReset: () => {
              setDraft(INITIAL_DECK_DRAFT);
              setPickedBackDeck(null);
            },
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'deck' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          {pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No deck picked">
              Pick a deck for the cardback, or choose another back mode.
            </Alert>
          ) : null}
          <DeckEditor
            nameField={nameField}
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
            members={[]}
            onCountChange={null}
            cardPicker={
              <Text size="xs" c="dimmed">
                Cards can be added once the deck has been saved.
              </Text>
            }
            backPicker={
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }} title={pickedBackDeck?.name}>
                  {pickedBackDeck ? pickedBackDeck.name : 'No deck chosen yet'}
                </Text>
                {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
                <Popover
                  opened={backPickerOpen}
                  onChange={setBackPickerOpen}
                  width={340}
                  position="bottom-start"
                  withinPortal
                >
                  <Popover.Target>
                    <Button
                      variant="light"
                      size="compact-sm"
                      style={{ flexShrink: 0 }}
                      onClick={() => setBackPickerOpen((open) => !open)}
                    >
                      {pickedBackDeck ? 'Change' : 'Choose'}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <AssetPicker
                      types={['deck']}
                      /*
                       * Best effort, not the full referenceability rule: listings present a healthy
                       * reference deck wearing its target's composition, so it reads as authored here
                       * and only a dangling presentation (cardback null) can be excluded client-side.
                       * assertReferenceableDeckCardback remains the gate at save.
                       */
                      filter={(entry) => {
                        const cardback = (entry.data as { cardback?: unknown } | null)?.cardback;
                        return typeof cardback === 'object' && cardback !== null;
                      }}
                      copy={{
                        searchLabel: 'Search decks',
                        searchPlaceholder: 'Type a name, slug or owner…',
                        emptyMessage: 'No other deck has a cardback to wear yet.',
                      }}
                      onPick={(picked) => {
                        setBackPickerOpen(false);
                        /* A pick is a draft edit, not a write; the reference reaches storage when the deck is saved. */
                        setPickedBackDeck(picked);
                        patch({ cardback: { mode: 'reference', asset_id: picked.id } });
                      }}
                      onCancel={() => setBackPickerOpen(false)}
                    />
                  </Popover.Dropdown>
                </Popover>
              </Group>
            }
            backProof={
              pickedBackDeck ? (
                <Stack gap={4} align="center" w="100%">
                  {/* A deck's face is its cardback, so the target's row draws its own proof. */}
                  <CanvasScale canvasWidth={900} canvasHeight={900 * assetFaceAspect('deck')}>
                    <AssetFace type="deck" data={pickedBackDeck.data} name={pickedBackDeck.name} width={900} />
                  </CanvasScale>
                  <Text size="xs" c="dimmed">
                    Cardback, from {pickedBackDeck.name}
                  </Text>
                </Stack>
              ) : null
            }
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
