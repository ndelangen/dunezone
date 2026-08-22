import { Alert, Anchor, Popover, Text } from '@mantine/core';
import { BundleAsset } from '@shared/assets/schema';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
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
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { bundleDraftWarnings, BundleEditor } from '@app/widgets/bundle-editor/BundleEditor';
import type { BundleChapter, BundleDraft } from '@app/widgets/bundle-editor/BundleEditor';

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
      <AssetEditorMessage title="Bundle not found" type="bundle">
        <Text>No bundle lives at this address.</Text>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="bundle">
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit bundles.
        </Text>
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type="bundle">
        <Text>
          {data.viewerAccess.assignedGroup
            ? 'Only the bundle owner or an active member of its group can edit this bundle.'
            : 'Only the bundle owner can edit this bundle.'}
        </Text>
      </AssetEditorMessage>
    );
  }

  const parsed = BundleAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="bundle" canDelete={data.viewerAccess.capabilities.delete}>
        <Text>This bundle's stored data no longer matches the bundle schema, so it cannot be edited here.</Text>
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
  const [draft, setDraft] = useState<BundleDraft>(initialDraft);
  const [baseline, setBaseline] = useState<BundleDraft>(initialDraft);
  const [chapter, setChapter] = useState<BundleChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patch = (update: Partial<BundleDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const tokens = members.map((entry) => ({ token: entry.member, count: entry.count }));
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'bundle',
    name: draft.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Identity',
    chapter: 'identity' as BundleChapter,
  });
  const warnings: (
    | ReturnType<typeof bundleDraftWarnings>[number]
    | { source: string; complaint: string; chapter: BundleChapter }
  )[] = [...bundleDraftWarnings(draft, tokens), ...conflictWarnings];
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
            void navigate({
              to: '/assets/$type/$slug/edit',
              params: { type: 'bundle', slug: nextSlug },
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
          status={{ isDirty, isNameBlank, saveState }}
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
            onSave: save,
            onReset: () => setDraft(baseline),
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
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
            members={tokens}
            countPending={setCount.isPending}
            onCountChange={(tokenId, count) =>
              setCount.mutate({ container_id: asset.id, member_id: tokenId as typeof asset.id, count })
            }
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
