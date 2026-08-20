import { Alert, Anchor, Group, Stack, Text } from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { AssignPopover } from '@ui/control/AssignPopover';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { UserRoundMinus, UsersRound } from 'lucide-react';
import { useState } from 'react';

import { useAssetPage, useDeleteAsset, useSetAssetGroup, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { TreacheryCardEditor, treacheryDraftWarnings } from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter, TreacheryDraft } from '@app/widgets/card-editor/TreacheryCardEditor';
import { TreacheryAsset } from '@game/data/objects';

import { AssetEditorMessage } from '../../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'card-validation-header';

/** The treachery card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-treachery`. */
export function TreacheryEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  const query = useAssetPage('card-treachery', slug, { initialData: loaderData });
  const data = query.data ?? loaderData;

  if (data === null) {
    return (
      <AssetEditorMessage type="card-treachery" title="Card not found">
        <Text>No treachery card lives at this address.</Text>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage type="card-treachery" title={`Edit ${data.asset.name}`}>
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit cards.
        </Text>
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage type="card-treachery" title={`Edit ${data.asset.name}`}>
        <Text>
          {data.viewerAccess.assignedGroup
            ? 'Only the card owner or an active member of its group can edit this card.'
            : 'Only the card owner can edit this card.'}
        </Text>
      </AssetEditorMessage>
    );
  }

  const parsed = TreacheryAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return <DriftedCardPage asset={data.asset} canDelete={data.viewerAccess.capabilities.delete} />;
  }

  return (
    <CardEditSession
      key={data.asset.id}
      asset={data.asset}
      initialDraft={parsed.data}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
    />
  );
}

/** What the editor toolbar needs to know about the viewer: what they may do, and which Groups they could hand the card to. */
type CardEditAccess = {
  viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
  assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
};

/**
 * The card's delete, wired once for both surfaces that offer it: the editor toolbar, and the dead end a card with drifted data lands on.
 * Deleting is the caller's to trigger and the page's to navigate away from;
 * this only holds the mutation.
 */
function useCardDeletion(assetId: NonNullable<AssetPageData>['asset']['id']) {
  const navigate = useNavigate();
  const deleteAsset = useDeleteAsset();
  return {
    pending: deleteAsset.isPending,
    error: deleteAsset.error,
    /* The card's own address is gone the moment it is retired, so leave for the type it belonged to. */
    confirm: () =>
      deleteAsset.mutate(
        { id: assetId },
        { onSuccess: () => void navigate({ to: '/assets/$type', params: { type: 'card-treachery' } }) }
      ),
  };
}

/**
 * A card whose stored data no longer satisfies the treachery schema, reachable whenever the schema tightens ahead of a backfill.
 * The editor cannot open it, but deletion never reads the data, so the owner keeps the one action that still applies rather than needing the database to be rid of it.
 */
function DriftedCardPage({ asset, canDelete }: { asset: NonNullable<AssetPageData>['asset']; canDelete: boolean }) {
  const deletion = useCardDeletion(asset.id);

  return (
    <AssetEditorMessage type="card-treachery" title={`Edit ${asset.name}`}>
      <Text>This card's stored data no longer matches the treachery card schema, so it cannot be edited here.</Text>
      {canDelete ? (
        <>
          <Text size="sm" c="dimmed">
            Deleting it is still open to you. The drifted data blocks the editor, not the delete.
          </Text>
          {deletion.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deletion.error.message}
            </Alert>
          ) : null}
          <Group>
            <ConfirmDeleteAction
              label="Delete card"
              prompt="Delete card?"
              pending={deletion.pending}
              onConfirm={deletion.confirm}
            />
          </Group>
        </>
      ) : null}
    </AssetEditorMessage>
  );
}

function CardEditSession({
  asset,
  initialDraft,
  access,
}: {
  asset: NonNullable<AssetPageData>['asset'];
  initialDraft: TreacheryDraft;
  access: CardEditAccess;
}) {
  const navigate = useNavigate();
  const updateAsset = useUpdateAsset();
  const deletion = useCardDeletion(asset.id);
  const setAssetGroup = useSetAssetGroup();
  const { assignedGroup, capabilities } = access.viewerAccess;
  const [draft, setDraft] = useState<TreacheryDraft>(initialDraft);
  const [baseline, setBaseline] = useState<TreacheryDraft>(initialDraft);
  const [chapter, setChapter] = useState<TreacheryChapter>('head');
  const [settleTick, setSettleTick] = useState(0);
  const patch = (update: Partial<TreacheryDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = treacheryDraftWarnings(draft);
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
          /* Renames re-slug: follow the card to its new URL so a reload keeps editing it. */
          if (nextSlug !== asset.slug) {
            void navigate({
              to: '/assets/$type/$slug/edit',
              params: { type: 'card-treachery', slug: nextSlug },
              replace: true,
            });
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
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
            statusMessage:
              saveState === 'error'
                ? 'The card was not saved.'
                : saveState === 'saved'
                  ? 'Saved. The card image is queued for publishing.'
                  : 'Changes stay local until you explicitly save them.',
          }}
          actions={{
            onSave: save,
            onReviewWarnings: () =>
              document.getElementById(VALIDATION_HEADER_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            onReset: () => setDraft(baseline),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'card-treachery' } }),
          }}
          auxiliaryActions={
            capabilities.changeGroup ? (
              assignedGroup ? (
                <IconAction
                  label="Remove group"
                  variant="light"
                  color="red"
                  size="lg"
                  disabled={setAssetGroup.isPending}
                  onClick={() => setAssetGroup.mutate({ id: asset.id, group_id: null })}
                  icon={<UserRoundMinus size={17} aria-hidden />}
                />
              ) : (
                <AssignPopover
                  noun="group"
                  triggerLabel="Assign group"
                  icon={<UsersRound size={17} aria-hidden />}
                  title="Assign Group"
                  descriptionLines={[
                    `Assign a group whose members can help maintain "${asset.name}".`,
                    'You can create and join groups from your profile.',
                  ]}
                  disabled={setAssetGroup.isPending}
                  options={access.assignableGroups.map((group) => ({
                    value: group.id,
                    label: `${group.name} (${group.slug})`,
                  }))}
                  onAssign={async (nextGroupId) => {
                    await setAssetGroup.mutateAsync({ id: asset.id, group_id: nextGroupId });
                  }}
                />
              )
            ) : null
          }
          context={
            assignedGroup ? (
              <Text size="xs" c="dimmed">
                Group access: <strong>{assignedGroup.name}</strong>
              </Text>
            ) : null
          }
          destructiveActions={
            capabilities.delete ? (
              <ConfirmDeleteAction
                label="Delete card"
                prompt="Delete card?"
                pending={deletion.pending}
                onConfirm={deletion.confirm}
              />
            ) : null
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
          {deletion.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deletion.error.message}
            </Alert>
          ) : null}
          {setAssetGroup.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not change group">
              {setAssetGroup.error.message}
            </Alert>
          ) : null}
          <TreacheryCardEditor
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
