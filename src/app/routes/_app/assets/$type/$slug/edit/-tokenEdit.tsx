import { Alert, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { TokenAsset } from '@shared/assets/schema';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { useNavigate } from '@tanstack/react-router';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { useAssetPage, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { initialTokenMemory, TokenEditor, TokenProof, tokenDraftWarnings } from '@app/widgets/token-editor/TokenEditor';
import type { TokenWarning, TokenChapter, TokenDraft, TokenMemory } from '@app/widgets/token-editor/TokenEditor';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
  useAssetNameField,
} from '../../../-assetEditorStates';
import { referencedTokenBackFace } from './-referencedBackFace';

export function TokenEditPage({ type, slug, loaderData }: { type: string; slug: string; loaderData: AssetPageData }) {
  const query = useAssetPage(type, slug, { initialData: loaderData });
  const data = query.data ?? loaderData;
  const label = isAssetType(type) ? ASSET_TYPES[type].shortLabel.toLowerCase() : 'token';

  if (data === null) {
    return (
      <AssetEditorMessage title="Edit token" type={type}>
        <NotAvailable title="Token not found">{`No ${label} token lives at this address.`}</NotAvailable>
      </AssetEditorMessage>
    );
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

  const parsed = TokenAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="token" canDelete={data.viewerAccess.capabilities.delete}>
        {`This token's stored data no longer matches the token schema, so it cannot be edited here.`}
      </DriftedAssetPage>
    );
  }

  /* The draft's reference member models pick-pending as an explicit null, which the stored optional cannot say. */
  const initialBack =
    parsed.data.back.mode === 'reference'
      ? { mode: 'reference' as const, asset_id: parsed.data.back.asset_id ?? null }
      : parsed.data.back;

  return (
    <TokenEditSession
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

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design.
 * `memory` is what the session needs and the stored token has no room for (D3): the face and target kept across mode flips, the declared Custom intents, the picked token the label and proof draw, and whether a save has already complained.
 * Rebuilding the whole state on `replace` is what makes a discarded pick actually discarded: while the face and target were refs in the widget, a Reset left them standing and the next save could write a reference the page never showed.
 */
type PageMemory = TokenMemory & { pickedBack: { name: string; data: unknown } | null; pickBlocked: boolean };

type PageState = { data: TokenDraft; memory: PageMemory; baseline: TokenDraft };

type PageEvent =
  | { kind: 'patch'; update: Partial<TokenDraft> }
  | { kind: 'remember'; update: Partial<PageMemory> }
  | { kind: 'replace'; data: TokenDraft; pick: { name: string; data: unknown } | null }
  | { kind: 'saved'; data: TokenDraft };

function openingState(data: TokenDraft, baseline: TokenDraft, pick: { name: string; data: unknown } | null): PageState {
  return { data, memory: { ...initialTokenMemory(data.back), pickedBack: pick, pickBlocked: false }, baseline };
}

function reduce(state: PageState, event: PageEvent): PageState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets; the seed pick rides on the event because the reducer holds no closure. */
    case 'replace':
      return openingState(event.data, state.baseline, event.pick);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

function TokenEditSession({
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
  initialDraft: TokenDraft;
}) {
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const [chapter, setChapter] = useState<TokenChapter>('identity');
  const [pickerOpen, setPickerOpen] = useState(false);
  /*
   * Server truth seeds the picked token and a pick replaces it; the draft holds only the id, and this holds the name and face the label and proof draw.
   * A reset returns it to that same server truth, which is why the seed rides on the replace event.
   */
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft, backToken));
  const patch = (update: Partial<TokenDraft>) => dispatch({ kind: 'patch', update });
  /*
   * The dangling complaint rides the widened validation header beside the widget's own warnings
   * («How a dangling back reference presents»): a signpost, never a second set of mode controls.
   * It routes to Identity, the chapter the back tiles live in.
   */
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type,
    name: state.data.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Identity',
    chapter: 'identity' as TokenChapter,
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'token',
  });
  const warnings: (TokenWarning | { source: string; complaint: string; chapter: TokenChapter })[] = [
    ...tokenDraftWarnings(state.data),
    ...conflictWarnings,
    ...(danglingBack && state.data.back.mode === 'reference'
      ? [{ source: 'Backside', complaint: 'its referenced back is gone', chapter: 'identity' as TokenChapter }]
      : []),
  ];
  /* The proof draws what was picked, which is the target's authored back, never its front; the shared reader carries the distrust. */
  const referencedBack = state.memory.pickedBack ? referencedTokenBackFace(state.memory.pickedBack.data) : null;
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const isNameBlank = !state.data.name.trim();
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });

  const pickless = state.data.back.mode === 'reference' && state.data.back.asset_id === null;

  const save = () => {
    /* A pickless reference is blocked here with words, rather than letting the stored schema answer with a Zod error. */
    dispatch({ kind: 'remember', update: { pickBlocked: pickless } });
    if (pickless) {
      return;
    }
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const saved = postedPayload(TokenAsset, state.data);
    updateAsset.mutate(
      { id: asset.id, data: saved },
      {
        onSuccess: ({ slug: nextSlug }) => {
          dispatch({ kind: 'saved', data: saved });
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
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty, isNameBlank, saveState }}
          copy={{
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline, pick: backToken })),
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
          <SaveErrorAlert error={updateAsset.error} />
          {deletion.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deletion.error.message}
            </Alert>
          ) : null}
          {groupActions.error}
          {state.memory.pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No token picked">
              Pick a token whose back this one wears, or choose another back mode.
            </Alert>
          ) : null}
          <TokenEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            type={type}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
            backPicker={(disabled) => (
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }} title={state.memory.pickedBack?.name}>
                  {state.memory.pickedBack ? state.memory.pickedBack.name : 'No token chosen yet'}
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
                      {state.memory.pickedBack ? 'Change' : 'Choose'}
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
                        dispatch({ kind: 'remember', update: { pickedBack: picked } });
                        patch({ back: { mode: 'reference', asset_id: picked.id } });
                      }}
                      onCancel={() => setPickerOpen(false)}
                    />
                  </Popover.Dropdown>
                </Popover>
              </Group>
            )}
            backProof={
              state.memory.pickedBack ? (
                <Stack gap={4} align="center" w="100%">
                  {referencedBack ? (
                    <TokenProof face={referencedBack} type={type} />
                  ) : (
                    <Text size="xs" c="dimmed">
                      Its stored back can no longer be read as an authored back, so it cannot be shown here.
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    Back, from {state.memory.pickedBack.name}
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
