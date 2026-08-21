import { Alert, Anchor, Popover, Text } from '@mantine/core';
import { authoredCardback, DeckAsset } from '@shared/assets/schema';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';

import { useAssetPage, useSetMemberCount, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { DeckEditor, deckDraftWarnings } from '@app/widgets/deck-editor/DeckEditor';
import type { DeckChapter, DeckDraft } from '@app/widgets/deck-editor/DeckEditor';

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

  /* A reference-mode cardback has no composition to edit; the editor that understands it lands with the back-picker slice. */
  const cardback = authoredCardback(parsed.data.cardback);
  if (!cardback) {
    return (
      <DriftedAssetPage asset={data.asset} noun="deck" canDelete={data.viewerAccess.capabilities.delete}>
        <Text>This deck's cardback references another deck, which this editor cannot edit yet.</Text>
      </DriftedAssetPage>
    );
  }

  return (
    <DeckEditSession
      key={data.asset.id}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
      asset={data.asset}
      members={data.members}
      initialDraft={{ ...parsed.data, cardback }}
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
  const deletion = useAssetDeletion(asset);
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
      /* The draft carries the bare composition; the stored shape wears the custom tag («The stored shape of three back modes»). */
      { id: asset.id, data: { ...saved, cardback: { mode: 'custom', ...saved.cardback } } },
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
            onReset: () => setDraft(baseline),
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
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
