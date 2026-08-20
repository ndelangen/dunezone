import { Alert, Anchor, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { DeckAsset } from '@shared/assets/schema';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { useAssetPage, useDeleteAsset, useSetMemberCount, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { DeckEditor, deckDraftWarnings } from '@app/widgets/deck-editor/DeckEditor';
import type { DeckChapter, DeckDraft } from '@app/widgets/deck-editor/DeckEditor';

import { AssetEditorMessage, DriftedAssetPage, useAssetGroupActions } from '../../../-assetEditorStates';

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

  return (
    <DeckEditSession
      key={data.asset.id}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
      asset={data.asset}
      members={data.members}
      initialDraft={parsed.data}
    />
  );
}

function DeckEditSession({
  access,
  asset,
  members,
  initialDraft,
}: {
  access: {
    viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
    assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
  };
  asset: NonNullable<AssetPageData>['asset'];
  members: NonNullable<AssetPageData>['members'];
  initialDraft: DeckDraft;
}) {
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  const setCount = useSetMemberCount();
  const [draft, setDraft] = useState<DeckDraft>(initialDraft);
  const [baseline, setBaseline] = useState<DeckDraft>(initialDraft);
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patch = (update: Partial<DeckDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const cards = members.map((entry) => ({ card: entry.member, count: entry.count }));
  const warnings = deckDraftWarnings(draft, cards);
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
    const saved = draft;
    updateAsset.mutate(
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
          status={{ isDirty, isNameBlank, warningCount: warnings.length, saveState }}
          copy={{
            saveLabel: 'Save deck',
            nameBlankMessage: 'Add a deck name before saving; it determines the deck URL.',
            statusMessage:
              saveState === 'error'
                ? 'The deck was not saved.'
                : "The deck publishes its cardback. Member cards publish their own faces, so editing one never invalidates the deck's image.",
          }}
          actions={{
            onSave: save,
            onReviewWarnings: () =>
              document.getElementById(VALIDATION_HEADER_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            onReset: () => setDraft(baseline),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'deck' } }),
          }}
          auxiliaryActions={groupActions.auxiliaryActions}
          context={groupActions.context}
          destructiveActions={
            <ConfirmDeleteAction
              label="Delete deck"
              prompt="Delete deck?"
              pending={deleteAsset.isPending}
              onConfirm={() =>
                deleteAsset.mutate(
                  { id: asset.id },
                  { onSuccess: () => void navigate({ to: '/assets/$type', params: { type: 'deck' } }) }
                )
              }
            />
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="sm" style={{ width: '100%', maxWidth: '78rem', margin: '0 auto' }}>
          {updateAsset.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not save">
              {updateAsset.error.message}
            </Alert>
          ) : null}
          {groupActions.error}
          {setCount.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not change the composition">
              {setCount.error.message}
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
            createCardAction={
              <Group gap="xs">
                <IconAction
                  label="Create a new card"
                  tooltip={
                    isDirty
                      ? 'Save your deck first, since creating a card leaves this page'
                      : 'Create a new card, then come back and add it'
                  }
                  variant="filled"
                  color="confirm"
                  size="lg"
                  disabled={isDirty}
                  onClick={() => void navigate({ to: '/assets/$type/create', params: { type: 'card-treachery' } })}
                  icon={<Plus size={17} aria-hidden />}
                />
                <Text size="xs" c="dimmed">
                  {isDirty ? 'Save first: creating a card leaves this page.' : 'Missing a card? Make one.'}
                </Text>
              </Group>
            }
            cardPicker={
              <Popover opened={pickerOpen} onChange={setPickerOpen} width={360} position="bottom-start" withinPortal>
                <Popover.Target>
                  <Button variant="light" size="compact-sm" onClick={() => setPickerOpen((open) => !open)}>
                    Add a card
                  </Button>
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
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
