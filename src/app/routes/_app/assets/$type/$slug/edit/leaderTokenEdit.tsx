import { Alert } from '@mantine/core';
import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { LeaderTokenAssetInput } from '@shared/assets/schema';
import { useNavigate } from '@tanstack/react-router';
import { NotAvailable } from '@ui/block/NotAvailable';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { useAssetPage, useUpdateAsset } from '@db/assets';
import type { AssetPageData, AssetPublicPage } from '@db/assets';
import { useAuthoringAccountKey } from '@db/authoring';
import { assetLoad } from '@app/pickers/assetLoadSource';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { LeaderTokenEditor, leaderTokenDraftWarnings } from '@app/widgets/token-editor/LeaderTokenEditor';
import type { LeaderTokenChapter, LeaderTokenDraft } from '@app/widgets/token-editor/LeaderTokenEditor';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
  assetNameField,
  AssetEditorViewerPending,
} from '../../../assetEditorStates';
import { openingLeaderTokenState, reduceLeaderTokenDraft, leaderTokenDraftStatus } from '../../leaderTokenAuthoring';

export function LeaderTokenEditPage({
  type,
  slug,
  loaderData,
}: {
  type: string;
  slug: string;
  loaderData: AssetPublicPage;
}) {
  const query = useAssetPage(type, slug, { initialData: loaderData });
  const data = query.data;
  const label = 'leader';

  if (data === null) {
    return (
      <AssetEditorMessage title="Edit token" type={type}>
        <NotAvailable title="Token not found">{`No ${label} token lives at this address.`}</NotAvailable>
      </AssetEditorMessage>
    );
  }

  if (!data.viewerResolved) {
    return <AssetEditorViewerPending name={data.asset.name} type={type} />;
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type={type}>
        <LoginGate action="edit tokens" />
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type={type}>
        <NotAvailable title="You cannot edit this token">
          {data.viewerAccess.assignedGroup
            ? 'Only the token owner or an active member of its group can edit this token.'
            : 'Only the token owner can edit this token.'}
        </NotAvailable>
      </AssetEditorMessage>
    );
  }

  const parsed = LeaderTokenAssetInput.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="token" canDelete={data.viewerAccess.capabilities.delete}>
        {`This token's stored data no longer matches the token schema, so it cannot be edited here.`}
      </DriftedAssetPage>
    );
  }

  return (
    <LeaderTokenEditSession
      key={data.asset.id}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
      type={type}
      asset={data.asset}
      initialDraft={parsed.data}
    />
  );
}

function LeaderTokenEditSession({
  access,
  type,
  asset,
  initialDraft,
}: {
  access: {
    viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
    assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
  };
  type: string;
  asset: NonNullable<AssetPageData>['asset'];
  initialDraft: LeaderTokenDraft;
}) {
  const authoringAccountKey = useAuthoringAccountKey();
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const [chapter, setChapter] = useState<LeaderTokenChapter>('identity');
  const [state, dispatch] = useReducer(reduceLeaderTokenDraft, undefined, () =>
    openingLeaderTokenState(initialDraft, initialDraft)
  );
  const patch = (update: Partial<LeaderTokenDraft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: leaderTokenDraftWarnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { isDirty, invalid, payload } = leaderTokenDraftStatus(state);
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const save = () => {
    if (!payload) {
      return;
    }
    updateAsset.mutate(
      { id: asset.id, data: payload },
      {
        onSuccess: ({ slug: nextSlug }) => {
          dispatch({ kind: 'saved', data: payload });
          if (nextSlug !== asset.slug) {
            void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug: nextSlug }, replace: true });
          }
        },
      }
    );
  };
  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          scopeKey={authoringAccountKey}
          load={assetLoad({
            noun: 'token',
            type: 'token-leader',
            schema: LeaderTokenAssetInput,
            editing: asset,
            canRename: access.viewerAccess.capabilities.rename,
            disabled: saveState === 'saving',
            presets: [{ label: 'Duke Prad Vidal', name: DUKE_PRAD_VIDAL_TOKEN.name, data: DUKE_PRAD_VIDAL_TOKEN }],
            onLoaded: header.releasing(({ data }) => {
              dispatch({ kind: 'replace', data });
              setChapter('identity');
            }),
          })}
          status={{ isDirty, invalid, isNameBlank: !state.data.name.trim(), saveState }}
          copy={{
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline })),
            onBack: () => void navigate({ to: '/assets/$type/$slug', params: { type, slug: asset.slug } }),
          }}
          accessActions={groupActions.accessActions}
          statuses={[groupActions.status]}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <ConfirmDeleteAction label="Delete token" pending={deletion.pending} onConfirm={deletion.confirm} />
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
          <LeaderTokenEditor
            nameField={assetNameField({
              canRename: access.viewerAccess.capabilities.rename,
              name: state.data.name,
              onName: (name) => patch({ name }),
              noun: 'token',
            })}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
