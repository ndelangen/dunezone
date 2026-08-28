import { Alert, Popover } from '@mantine/core';
import { BundleAsset } from '@shared/assets/schema';
import { useNavigate } from '@tanstack/react-router';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { useAssetPage, useSetMemberCount, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { mutationErrorMessage } from '@app/db/core/mutationError';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeader } from '@app/widgets/authoring/useValidationHeader';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { bundleDraftWarnings, BundleEditor, INITIAL_BUNDLE_MEMORY } from '@app/widgets/bundle-editor/BundleEditor';
import type { BundleChapter, BundleDraft, BundleMemory } from '@app/widgets/bundle-editor/BundleEditor';
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

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design, because the generic version cost more than the duplication it removed.
 * `memory` is what the session needs and the stored bundle has no room for (D3), and `baseline` is what a reset returns to.
 */
type BundleState = { data: BundleDraft; memory: BundleMemory; baseline: BundleDraft };

type BundleEvent =
  | { kind: 'patch'; update: Partial<BundleDraft> }
  | { kind: 'remember'; update: Partial<BundleMemory> }
  | { kind: 'replace'; data: BundleDraft }
  | { kind: 'saved'; data: BundleDraft };

function openingState(data: BundleDraft, baseline: BundleDraft): BundleState {
  return { data, memory: INITIAL_BUNDLE_MEMORY, baseline };
}

function reduce(state: BundleState, event: BundleEvent): BundleState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets. */
    case 'replace':
      return openingState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
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
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft));
  const patch = (update: Partial<BundleDraft>) => dispatch({ kind: 'patch', update });
  const tokens = members.map((entry) => ({ token: entry.member, count: entry.count }));
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'bundle',
    name: state.data.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Identity',
    chapter: 'identity' as BundleChapter,
  });
  const warnings: (
    | ReturnType<typeof bundleDraftWarnings>[number]
    | { source: string; complaint: string; chapter: BundleChapter }
  )[] = [...bundleDraftWarnings(state.data, tokens), ...conflictWarnings];
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
  const header = useValidationHeader(warnings.length);

  const save = () => {
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const saved = postedPayload(BundleAssetSchema, state.data);
    updateAsset.mutate(
      { id: asset.id, data: saved },
      {
        onSuccess: ({ slug: nextSlug }) => {
          dispatch({ kind: 'saved', data: saved });
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
      {header.open ? (
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
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline })),
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
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
            members={tokens}
            countPending={setCount.isPending}
            onCountChange={header.releasing((tokenId: string, count: number) =>
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
