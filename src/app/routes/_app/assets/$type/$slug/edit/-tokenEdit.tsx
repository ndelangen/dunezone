import { Alert, Anchor, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { TokenAsset } from '@shared/assets/schema';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { useState } from 'react';

import { useAssetPage, useDeleteAsset, useSetTokenBack, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { TokenEditor, TokenProof, tokenDraftWarnings } from '@app/widgets/token-editor/TokenEditor';
import type { TokenChapter, TokenDraft } from '@app/widgets/token-editor/TokenEditor';

import { AssetEditorMessage } from '../../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'token-validation-header';

export function TokenEditPage({ type, slug, loaderData }: { type: string; slug: string; loaderData: AssetPageData }) {
  const query = useAssetPage(type, slug, { initialData: loaderData });
  const data = query.data ?? loaderData;
  const label = isAssetType(type) ? ASSET_TYPES[type].shortLabel.toLowerCase() : 'token';

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

  const parsed = TokenAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <AssetEditorMessage title={`Edit ${data.asset.name}`} type={type}>
        <Text>This token's stored data no longer matches the token schema, so it cannot be edited here.</Text>
      </AssetEditorMessage>
    );
  }

  return (
    <TokenEditSession
      key={data.asset.id}
      type={type}
      asset={data.asset}
      backToken={data.backToken}
      initialDraft={parsed.data}
    />
  );
}

function TokenEditSession({
  type,
  asset,
  backToken,
  initialDraft,
}: {
  type: string;
  asset: NonNullable<AssetPageData>['asset'];
  backToken: NonNullable<AssetPageData>['backToken'];
  initialDraft: TokenDraft;
}) {
  const navigate = useNavigate();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  const setTokenBack = useSetTokenBack();
  const [draft, setDraft] = useState<TokenDraft>(initialDraft);
  const [baseline, setBaseline] = useState<TokenDraft>(initialDraft);
  const [chapter, setChapter] = useState<TokenChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patch = (update: Partial<TokenDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = tokenDraftWarnings(draft, backToken !== null);
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
          status={{ isDirty, isNameBlank, warningCount: warnings.length, saveState }}
          copy={{
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
            statusMessage:
              saveState === 'error'
                ? 'The token was not saved.'
                : draft.back.mode === 'custom'
                  ? 'Both faces publish once the image pipeline supports tokens.'
                  : 'The front publishes once the image pipeline supports tokens; the back resolves to the referenced token.',
          }}
          actions={{
            onSave: save,
            onReviewWarnings: () =>
              document.getElementById(VALIDATION_HEADER_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            onReset: () => setDraft(baseline),
            onBack: () => void navigate({ to: '/assets/$type', params: { type } }),
          }}
          destructiveActions={
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
          {setTokenBack.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not set the backside">
              {setTokenBack.error.message}
            </Alert>
          ) : null}
          <TokenEditor
            draft={draft}
            patch={patch}
            type={type}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
            backPicker={
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">{backToken ? backToken.name : 'No token chosen yet'}</Text>
                {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
                <Popover opened={pickerOpen} onChange={setPickerOpen} width={340} position="bottom-start" withinPortal>
                  <Popover.Target>
                    <Button variant="light" size="compact-sm" onClick={() => setPickerOpen((open) => !open)}>
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
            }
            backProof={
              backToken ? (
                <Stack gap={4} align="center">
                  <TokenProof
                    face={(backToken.data as { front: TokenDraft['front'] }).front}
                    type={backToken.type}
                    width={220}
                  />
                  <Text size="xs" c="dimmed">
                    Back, from {backToken.name}
                  </Text>
                </Stack>
              ) : null
            }
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
