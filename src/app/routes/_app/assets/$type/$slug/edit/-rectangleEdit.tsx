import { Alert, Anchor, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { RectangleTokenAsset } from '@shared/assets/schema';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useAssetPage, useDeleteAsset, useSetTokenBack, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { assetFaceAspect } from '@app/widgets/asset-face/AssetFace';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import {
  RectangleTokenEditor,
  RectangleProof,
  rectangleDraftWarnings,
} from '@app/widgets/token-editor/RectangleTokenEditor';
import type { RectangleChapter, RectangleDraft } from '@app/widgets/token-editor/RectangleTokenEditor';

import { AssetEditorMessage, DriftedAssetPage, useAssetGroupActions } from '../../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'rectangle-token-validation-header';

export function RectangleEditPage({
  type,
  slug,
  loaderData,
}: {
  type: string;
  slug: string;
  loaderData: AssetPageData;
}) {
  const query = useAssetPage(type, slug, { initialData: loaderData });
  const data = query.data ?? loaderData;
  const label = 'rectangle';

  if (data === null) {
    return (
      <AssetEditorMessage title="Token not found" type={type}>
        <Text>No {label} token lives at this address.</Text>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type={type}>
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit tokens.
        </Text>
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type={type}>
        <Text>
          {data.viewerAccess.assignedGroup
            ? 'Only the token owner or an active member of its group can edit this token.'
            : 'Only the token owner can edit this token.'}
        </Text>
      </AssetEditorMessage>
    );
  }

  const parsed = RectangleTokenAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="token" canDelete={data.viewerAccess.capabilities.delete}>
        <Text>This token's stored data no longer matches the token schema, so it cannot be edited here.</Text>
      </DriftedAssetPage>
    );
  }

  return (
    <RectangleEditSession
      key={data.asset.id}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
      type={type}
      asset={data.asset}
      backToken={data.backToken}
      initialDraft={parsed.data}
    />
  );
}

function RectangleEditSession({
  access,
  type,
  asset,
  backToken,
  initialDraft,
}: {
  access: {
    viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
    assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
  };
  type: string;
  asset: NonNullable<AssetPageData>['asset'];
  backToken: NonNullable<AssetPageData>['backToken'];
  initialDraft: RectangleDraft;
}) {
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  const setTokenBack = useSetTokenBack();
  const [draft, setDraft] = useState<RectangleDraft>(initialDraft);
  const [baseline, setBaseline] = useState<RectangleDraft>(initialDraft);
  const [chapter, setChapter] = useState<RectangleChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patch = (update: Partial<RectangleDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = rectangleDraftWarnings(draft, backToken !== null);
  /* The referenced token's data is another asset's, so it gets the same distrust as our own: a back that no longer parses shows a note, never a crash. */
  const parsedBack = backToken ? RectangleTokenAsset.safeParse(backToken.data) : null;
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
          /* Renames re-slug: follow the token to its new URL so a reload keeps editing it. */
          if (nextSlug !== asset.slug) {
            void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug: nextSlug }, replace: true });
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
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
          }}
          actions={{
            onSave: save,
            onReset: () => setDraft(baseline),
            onBack: () => void navigate({ to: '/assets/$type', params: { type } }),
          }}
          auxiliaryActions={groupActions.auxiliaryActions}
          context={groupActions.context}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <ConfirmDeleteAction
                label="Delete token"
                prompt="Delete token?"
                pending={deleteAsset.isPending}
                onConfirm={() =>
                  deleteAsset.mutate(
                    { id: asset.id },
                    { onSuccess: () => void navigate({ to: '/assets/$type', params: { type } }) }
                  )
                }
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
          {groupActions.error}
          {setTokenBack.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not set the backside">
              {setTokenBack.error.message}
            </Alert>
          ) : null}
          <RectangleTokenEditor
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
            backPicker={(disabled) => (
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">{backToken ? backToken.name : 'No token chosen yet'}</Text>
                {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
                <Popover opened={pickerOpen} onChange={setPickerOpen} width={340} position="bottom-start" withinPortal>
                  <Popover.Target>
                    <Button
                      variant="light"
                      size="compact-sm"
                      disabled={disabled}
                      onClick={() => setPickerOpen((open) => !open)}
                    >
                      {backToken ? 'Change' : 'Choose'}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <AssetPicker
                      types={[type]}
                      excludeIds={[asset.id]}
                      copy={{
                        searchLabel: 'Search tokens',
                        searchPlaceholder: 'Type a name, slug or owner…',
                        emptyMessage: 'No other tokens of this shape exist yet.',
                      }}
                      onPick={(picked) => {
                        setPickerOpen(false);
                        setTokenBack.mutate({ id: asset.id, back_asset_id: picked.id });
                      }}
                      onCancel={() => setPickerOpen(false)}
                    />
                  </Popover.Dropdown>
                </Popover>
              </Group>
            )}
            backProof={
              backToken ? (
                <Stack gap={4} align="center" w="100%">
                  {parsedBack?.success ? (
                    <CanvasScale canvasWidth={900} canvasHeight={900 * assetFaceAspect(backToken.type)}>
                      <RectangleProof face={parsedBack.data.front} width={900} />
                    </CanvasScale>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Its stored data no longer parses, so its face cannot be shown here.
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    Back, from {backToken.name}
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
