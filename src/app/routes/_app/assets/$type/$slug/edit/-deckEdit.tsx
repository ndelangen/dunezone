import { Alert, Anchor, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { DeckAsset } from '@shared/assets/schema';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';

import { useAssetPage, useSetMemberCount, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { AssetFace, assetFaceAspect } from '@app/widgets/asset-face/AssetFace';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { DeckEditor, deckDraftWarnings } from '@app/widgets/deck-editor/DeckEditor';
import type { DeckChapter, DeckDraft, DeckDraftCardback, DeckWarning } from '@app/widgets/deck-editor/DeckEditor';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  useAssetDeletion,
  useAssetGroupActions,
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
      <AssetEditorMessage title="Deck not found" type="deck">
        <Text>No deck lives at this address.</Text>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="deck">
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit decks.
        </Text>
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="deck">
        <Text>
          {data.viewerAccess.assignedGroup
            ? 'Only the deck owner or an active member of its group can edit this deck.'
            : 'Only the deck owner can edit this deck.'}
        </Text>
      </AssetEditorMessage>
    );
  }

  const parsed = DeckAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="deck" canDelete={data.viewerAccess.capabilities.delete}>
        <Text>This deck's stored data no longer matches the deck schema, so it cannot be edited here.</Text>
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
  const [draft, setDraft] = useState<DeckDraft>(initialDraft);
  const [baseline, setBaseline] = useState<DeckDraft>(initialDraft);
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [backPickerOpen, setBackPickerOpen] = useState(false);
  /*
   * The deck whose cardback the draft references, for the label and the proof.
   * Server truth seeds it and a pick replaces it; the draft holds only the id.
   */
  const [pickedBackDeck, setPickedBackDeck] = useState<{ name: string; data: unknown } | null>(backDeck);
  /* Armed by a save attempt while the reference has no target; disarmed the moment the state resolves. */
  const [pickBlocked, setPickBlocked] = useState(false);
  const patch = (update: Partial<DeckDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const cards = members.map((entry) => ({ card: entry.member, count: entry.count }));
  /*
   * The dangling complaint rides the widened validation header beside the widget's own warnings
   * («How a dangling back reference presents»), routed to Identity, the chapter the back tiles live in.
   */
  const warnings: (DeckWarning | { source: string; complaint: string; chapter: DeckChapter })[] = [
    ...deckDraftWarnings(draft, cards),
    ...(danglingBack && draft.cardback.mode === 'reference'
      ? [{ source: 'Cardback', complaint: 'its referenced deck is gone', chapter: 'identity' as DeckChapter }]
      : []),
  ];
  const pickless = draft.cardback.mode === 'reference' && draft.cardback.asset_id === null;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const isNameBlank = !draft.name.trim();
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const validationHeaderOpen = useValidationHeaderOpen(warnings.length, settleTick);

  const save = () => {
    /* A pickless reference is blocked here with words, rather than letting the strict stored union answer with a Zod error. */
    if (pickless) {
      setPickBlocked(true);
      return;
    }
    setPickBlocked(false);
    const saved = draft;
    updateAsset.mutate(
      /* The draft carries its mode, so the save writes it through; the strict stored union is the one truth («The stored shape of three back modes»). */
      { id: asset.id, data: saved },
      {
        onSuccess: ({ slug: nextSlug }) => {
          setBaseline(saved);
          if (nextSlug !== asset.slug) {
            void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'deck', slug: nextSlug }, replace: true });
          }
        },
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
              setDraft(baseline);
              /* The pick lives in the draft, so discarding the draft discards the pick with it. */
              setPickedBackDeck(backDeck);
              setPickBlocked(false);
            },
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
              <ConfirmDeleteAction
                label="Delete deck"
                prompt="Delete deck?"
                pending={deletion.pending}
                onConfirm={deletion.confirm}
              />
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          {updateAsset.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not save">
              {updateAsset.error.message}
            </Alert>
          ) : null}
          {deletion.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deletion.error.message}
            </Alert>
          ) : null}
          {groupActions.error}
          {setCount.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not change the composition">
              {setCount.error.message}
            </Alert>
          ) : null}
          {pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No deck picked">
              Pick a deck whose cardback this one wears, or choose another back mode.
            </Alert>
          ) : null}
          <DeckEditor
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
            members={cards}
            onCountChange={(cardId, count) =>
              setCount.mutate({ container_id: asset.id, member_id: cardId as typeof asset.id, count })
            }
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
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">{pickedBackDeck ? pickedBackDeck.name : 'No deck chosen yet'}</Text>
                {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
                <Popover
                  opened={backPickerOpen}
                  onChange={setBackPickerOpen}
                  width={340}
                  position="bottom-start"
                  withinPortal
                >
                  <Popover.Target>
                    <Button variant="light" size="compact-sm" onClick={() => setBackPickerOpen((open) => !open)}>
                      {pickedBackDeck ? 'Change' : 'Choose'}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <AssetPicker
                      types={['deck']}
                      excludeIds={[asset.id]}
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
