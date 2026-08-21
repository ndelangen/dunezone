import { Alert, Anchor, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { RectangleTokenAsset } from '@shared/assets/schema';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useAssetPage, useUpdateAsset } from '@app/db/assets';
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
import type {
  RectangleWarning,
  RectangleChapter,
  RectangleDraft,
} from '@app/widgets/token-editor/RectangleTokenEditor';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  useAssetDeletion,
  useAssetGroupActions,
} from '../../../-assetEditorStates';
import { referencedRectangleBackFace } from './-referencedBackFace';

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

  /* The draft's reference member models pick-pending as an explicit null, which the stored optional cannot say. */
  const initialBack =
    parsed.data.back.mode === 'reference'
      ? { mode: 'reference' as const, asset_id: parsed.data.back.asset_id ?? null }
      : parsed.data.back;

  return (
    <RectangleEditSession
      key={data.asset.id}
      access={{ viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups }}
      type={type}
      asset={data.asset}
      backToken={data.backToken}
      danglingBack={data.resolvedBack?.mode === 'dangling'}
      initialDraft={{ ...parsed.data, back: initialBack }}
    />
  );
}

function RectangleEditSession({
  access,
  type,
  asset,
  backToken,
  danglingBack,
  initialDraft,
}: {
  access: {
    viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
    assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
  };
  type: string;
  asset: NonNullable<AssetPageData>['asset'];
  backToken: NonNullable<AssetPageData>['backToken'];
  /** The server judged the stored reference dangling; the routes only relay the complaint. */
  danglingBack: boolean;
  initialDraft: RectangleDraft;
}) {
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const [draft, setDraft] = useState<RectangleDraft>(initialDraft);
  /*
   * The token whose back the draft references, for the label and the proof.
   * Server truth seeds it and a pick replaces it; the draft holds only the id, and demanding the
   * entry back from the server before save would make the pick a write, which it no longer is.
   */
  const [pickedBack, setPickedBack] = useState<{ name: string; data: unknown } | null>(backToken);
  /* Armed by a save attempt while the reference has no target; disarmed the moment the state resolves. */
  const [pickBlocked, setPickBlocked] = useState(false);
  const [baseline, setBaseline] = useState<RectangleDraft>(initialDraft);
  const [chapter, setChapter] = useState<RectangleChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patch = (update: Partial<RectangleDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  /*
   * The dangling complaint rides the widened validation header beside the widget's own warnings
   * («How a dangling back reference presents»): a signpost, never a second set of mode controls.
   * It routes to Identity, the chapter the back tiles live in.
   */
  const warnings: (RectangleWarning | { source: string; complaint: string; chapter: RectangleChapter })[] = [
    ...rectangleDraftWarnings(draft),
    ...(danglingBack && draft.back.mode === 'reference'
      ? [{ source: 'Backside', complaint: 'its referenced back is gone', chapter: 'identity' as RectangleChapter }]
      : []),
  ];
  /* The proof draws what was picked, which is the target's authored back, never its front; the shared reader carries the distrust. */
  const referencedBack = pickedBack ? referencedRectangleBackFace(pickedBack.data) : null;
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

  const pickless = draft.back.mode === 'reference' && draft.back.asset_id === null;

  const save = () => {
    /* A pickless reference is blocked here with words, rather than letting the stored schema answer with a Zod error. */
    if (pickless) {
      setPickBlocked(true);
      return;
    }
    setPickBlocked(false);
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
            onReset: () => {
              setDraft(baseline);
              /* The pick lives in the draft now, so discarding the draft discards the pick with it. */
              setPickedBack(backToken);
              setPickBlocked(false);
            },
            onBack: () => void navigate({ to: '/assets/$type', params: { type } }),
          }}
          auxiliaryActions={groupActions.auxiliaryActions}
          context={groupActions.context}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <ConfirmDeleteAction label="Delete token" pending={deletion.pending} onConfirm={deletion.confirm} />
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
          {pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No token picked">
              Pick a token whose back this one wears, or choose another back mode.
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
                <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }} title={pickedBack?.name}>
                  {pickedBack ? pickedBack.name : 'No token chosen yet'}
                </Text>
                {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
                <Popover opened={pickerOpen} onChange={setPickerOpen} width={340} position="bottom-start" withinPortal>
                  <Popover.Target>
                    <Button
                      variant="light"
                      size="compact-sm"
                      style={{ flexShrink: 0 }}
                      disabled={disabled}
                      onClick={() => setPickerOpen((open) => !open)}
                    >
                      {pickedBack ? 'Change' : 'Choose'}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <AssetPicker
                      previewSide="back"
                      types={[type]}
                      excludeIds={[asset.id]}
                      /* Only an authored back is referenceable («Which tokens are referenceable»); token listings are unpresented, so the stored mode is readable here. */
                      filter={(entry) => (entry.data as { back?: { mode?: string } } | null)?.back?.mode === 'custom'}
                      copy={{
                        searchLabel: 'Search tokens',
                        searchPlaceholder: 'Type a name, slug or owner…',
                        emptyMessage: 'No other token of this shape has an authored back yet.',
                      }}
                      onPick={(picked) => {
                        setPickerOpen(false);
                        /* A pick is a draft edit, not a write; the reference reaches storage when the token is saved («The stored shape of three back modes»: one field, one writer). */
                        setPickedBack(picked);
                        patch({ back: { mode: 'reference', asset_id: picked.id } });
                      }}
                      onCancel={() => setPickerOpen(false)}
                    />
                  </Popover.Dropdown>
                </Popover>
              </Group>
            )}
            backProof={
              pickedBack ? (
                <Stack gap={4} align="center" w="100%">
                  {referencedBack ? (
                    /* The picker offers only this token's own type, so the page's type fixes the aspect. */
                    <CanvasScale canvasWidth={900} canvasHeight={900 * assetFaceAspect(type)}>
                      <RectangleProof face={referencedBack} width={900} />
                    </CanvasScale>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Its stored back can no longer be read as an authored back, so it cannot be shown here.
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    Back, from {pickedBack.name}
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
