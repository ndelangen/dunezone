import { Alert, Popover } from '@mantine/core';
import { BundleAsset } from '@shared/assets/schema';
import { useNavigate } from '@tanstack/react-router';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useAssetPage, useSetMemberCount, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { mutationErrorMessage } from '@app/db/core/mutationError';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useAuthoringEnvelope, useAuthoringSession } from '@app/widgets/authoring/useAuthoringSession';
import { bundleDraftWarnings, BundleEditor, INITIAL_BUNDLE_MEMORY } from '@app/widgets/bundle-editor/BundleEditor';
import type { BundleChapter, BundleDraft } from '@app/widgets/bundle-editor/BundleEditor';
import { BundleAsset as BundleAssetSchema } from '@game/data/objects';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
  useAssetNameField,
} from '../../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'bundle-validation-header';

/** Every token type a bundle may hold. A bundle mixes shapes freely, which is the point of it. */
const TOKEN_TYPES = ['token-disc', 'token-tech', 'token-plate', 'token-enhance'];

export function BundleEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  const query = useAssetPage('bundle', slug, { initialData: loaderData });
  const data = query.data ?? loaderData;

  if (data === null) {
    return (
      <AssetEditorMessage title="Edit bundle" type="bundle">
        <NotAvailable title="Bundle not found">No bundle lives at this address.</NotAvailable>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="bundle">
        <LoginGate action="edit bundles" />
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="bundle">
        <NotAvailable title="You cannot edit this bundle">
          {data.viewerAccess.assignedGroup
            ? 'Only the bundle owner or an active member of its group can edit this bundle.'
            : 'Only the bundle owner can edit this bundle.'}
        </NotAvailable>
      </AssetEditorMessage>
    );
  }

  const parsed = BundleAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="bundle" canDelete={data.viewerAccess.capabilities.delete}>
        {`This bundle's stored data no longer matches the bundle schema, so it cannot be edited here.`}
      </DriftedAssetPage>
    );
  }

  return (
    <BundleEditSession
      key={data.asset.id}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
      asset={data.asset}
      members={data.members}
      initialDraft={parsed.data}
    />
  );
}

function BundleEditSession({
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
  initialDraft: BundleDraft;
}) {
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const setCount = useSetMemberCount();
  const [chapter, setChapter] = useState<BundleChapter>('identity');
  const [pickerOpen, setPickerOpen] = useState(false);
  const envelope = useAuthoringEnvelope({ initialData: initialDraft, initialMemory: INITIAL_BUNDLE_MEMORY });
  const tokens = members.map((entry) => ({ token: entry.member, count: entry.count }));
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'bundle',
    name: envelope.draft.name,
    onName: (name) => envelope.patch({ name }),
    currentSlug: asset.slug,
    source: 'Identity',
    chapter: 'identity' as BundleChapter,
  });
  const warnings = [...bundleDraftWarnings(envelope.draft, tokens), ...conflictWarnings];
  const session = useAuthoringSession({
    envelope,
    warnings,
    schema: BundleAssetSchema,
    mutation: updateAsset,
    variables: (payload) => ({ id: asset.id, data: payload }),
    /* Renames re-slug: follow the bundle to its new URL so a reload keeps editing it. */
    validationHeaderId: VALIDATION_HEADER_ID,
    onFocusWarning: (warning) => setChapter(warning.chapter),
    onSaved: ({ slug: nextSlug }) => {
      if (nextSlug !== asset.slug) {
        void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'bundle', slug: nextSlug }, replace: true });
      }
    },
  });

  return (
    <PageLayout>
      {session.band}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={session.status}
          copy={{
            saveLabel: 'Save bundle',
            nameBlankMessage: 'Add a bundle name before saving; it determines the bundle URL.',
            /*
             * A bundle publishes nothing, so this says what does happen rather than leaving a publication line that
             * would never fill in. `AuthoringToolbar` already omits its "Last published" line when there is no
             * timestamp, so nothing here has to suppress it.
             */
          }}
          actions={{
            onSave: session.actions.save,
            onReset: session.actions.reset,
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'bundle' } }),
          }}
          auxiliaryActions={groupActions.auxiliaryActions}
          context={groupActions.context}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <ConfirmDeleteAction label="Delete bundle" pending={deletion.pending} onConfirm={deletion.confirm} />
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
            <Alert color="red" variant="light" role="alert" title="Could not change the contents">
              {mutationErrorMessage(setCount.error)}
            </Alert>
          ) : null}
          <BundleEditor
            nameField={nameField}
            {...session.editorProps}
            chapter={chapter}
            onChapterChange={setChapter}
            members={tokens}
            countPending={setCount.isPending}
            onCountChange={session.header.releasing((tokenId: string, count: number) =>
              setCount.mutate({ container_id: asset.id, member_id: tokenId as typeof asset.id, count })
            )}
            tokenPicker={
              <Popover opened={pickerOpen} onChange={setPickerOpen} width={360} position="bottom-start" withinPortal>
                <Popover.Target>
                  {/* The same small green plus nine other controls grow a collection with, so a picker reads as an add rather than as a banner. */}
                  <AddAction label="Add a token" onClick={() => setPickerOpen((open) => !open)} />
                </Popover.Target>
                <Popover.Dropdown>
                  <AssetPicker
                    types={TOKEN_TYPES}
                    excludeIds={tokens.map((entry) => entry.token.id)}
                    copy={{
                      searchLabel: 'Search tokens',
                      searchPlaceholder: 'Type a name, slug or owner…',
                      emptyMessage: 'No tokens exist yet.',
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
