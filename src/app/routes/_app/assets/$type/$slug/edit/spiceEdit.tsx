import { Alert } from '@mantine/core';
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
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { SpiceCardEditor, spiceDraftWarnings } from '@app/widgets/card-editor/SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';
import { SpiceAsset } from '@game/data/objects';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
  useAssetNameField,
} from '../../../assetEditorStates';

/** The spice card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-spice`. */
export function SpiceEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  const query = useAssetPage('card-spice', slug, { initialData: loaderData });
  const data = query.data ?? loaderData;

  if (data === null) {
    return (
      <AssetEditorMessage type="card-spice" title="Edit card">
        <NotAvailable title="Card not found">No spice card lives at this address.</NotAvailable>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage type="card-spice" title={`Edit ${data.asset.name}`}>
        <LoginGate action="edit cards" />
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage type="card-spice" title={`Edit ${data.asset.name}`}>
        <NotAvailable title="You cannot edit this card">
          {data.viewerAccess.assignedGroup
            ? 'Only the card owner or an active member of its group can edit this card.'
            : 'Only the card owner can edit this card.'}
        </NotAvailable>
      </AssetEditorMessage>
    );
  }

  const parsed = SpiceAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="card" canDelete={data.viewerAccess.capabilities.delete}>
        {`This card's stored data no longer matches the spice card schema, so it cannot be edited here.`}
      </DriftedAssetPage>
    );
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
 * This page's authoring state, and the three things that happen to it.
 * Written here rather than shared, as every editor's is (D7 on «Work the editors wave»).
 */
type SpiceState = { data: SpiceDraft; baseline: SpiceDraft };

type SpiceEvent =
  | { kind: 'patch'; update: Partial<SpiceDraft> }
  | { kind: 'replace'; data: SpiceDraft }
  | { kind: 'saved'; data: SpiceDraft };

function reduce(state: SpiceState, event: SpiceEvent): SpiceState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'replace':
      return { data: event.data, baseline: state.baseline };
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

function CardEditSession({
  asset,
  initialDraft,
  access,
}: {
  asset: NonNullable<AssetPageData>['asset'];
  initialDraft: SpiceDraft;
  access: CardEditAccess;
}) {
  const navigate = useNavigate();
  const updateAsset = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const groupActions = useAssetGroupActions({ asset, access });
  const { capabilities } = access.viewerAccess;
  const [chapter, setChapter] = useState<SpiceChapter>('head');
  const [state, dispatch] = useReducer(reduce, { data: initialDraft, baseline: initialDraft });
  const patch = (update: Partial<SpiceDraft>) => dispatch({ kind: 'patch', update });
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'card-spice',
    name: state.data.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Head',
    chapter: 'head' as SpiceChapter,
    canRename: capabilities.rename,
    noun: 'card',
  });
  const warnings = [...spiceDraftWarnings(state.data), ...conflictWarnings];
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';

  const save = () => {
    const payload = postedPayload(SpiceAsset, state.data);
    updateAsset.mutate(
      { id: asset.id, data: payload },
      {
        onSuccess: ({ slug: nextSlug }) => {
          dispatch({ kind: 'saved', data: payload });
          /* Renames re-slug: follow the card to its new URL so a reload keeps editing it. */
          if (nextSlug !== asset.slug) {
            void navigate({
              to: '/assets/$type/$slug/edit',
              params: { type: 'card-spice', slug: nextSlug },
              replace: true,
            });
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
          status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState }}
          copy={{
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline })),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'card-spice' } }),
          }}
          auxiliaryActions={groupActions.auxiliaryActions}
          context={groupActions.context}
          destructiveActions={
            capabilities.delete ? (
              <ConfirmDeleteAction label="Delete card" pending={deletion.pending} onConfirm={deletion.confirm} />
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
          <SpiceCardEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
