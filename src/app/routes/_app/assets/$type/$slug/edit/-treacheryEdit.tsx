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
import {
  INITIAL_TREACHERY_MEMORY,
  TreacheryCardEditor,
  treacheryDraftWarnings,
} from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter, TreacheryDraft, TreacheryMemory } from '@app/widgets/card-editor/TreacheryCardEditor';
import { TreacheryAsset } from '@game/data/objects';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
  useAssetNameField,
} from '../../../-assetEditorStates';

/** The treachery card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-treachery`. */
export function TreacheryEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  const query = useAssetPage('card-treachery', slug, { initialData: loaderData });
  const data = query.data ?? loaderData;

  if (data === null) {
    return (
      <AssetEditorMessage type="card-treachery" title="Edit card">
        <NotAvailable title="Card not found">No treachery card lives at this address.</NotAvailable>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage type="card-treachery" title={`Edit ${data.asset.name}`}>
        <LoginGate action="edit cards" />
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage type="card-treachery" title={`Edit ${data.asset.name}`}>
        <NotAvailable title="You cannot edit this card">
          {data.viewerAccess.assignedGroup
            ? 'Only the card owner or an active member of its group can edit this card.'
            : 'Only the card owner can edit this card.'}
        </NotAvailable>
      </AssetEditorMessage>
    );
  }

  const parsed = TreacheryAsset.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun="card" canDelete={data.viewerAccess.capabilities.delete}>
        {`This card's stored data no longer matches the treachery card schema, so it cannot be edited here.`}
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
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design, because the generic version cost more than the duplication it removed.
 * `memory` is what the session needs and the stored card has no room for (D3), and `baseline` is what a reset returns to.
 */
type TreacheryState = { data: TreacheryDraft; memory: TreacheryMemory; baseline: TreacheryDraft };

type TreacheryEvent =
  | { kind: 'patch'; update: Partial<TreacheryDraft> }
  | { kind: 'remember'; update: Partial<TreacheryMemory> }
  | { kind: 'replace'; data: TreacheryDraft }
  | { kind: 'saved'; data: TreacheryDraft };

function openingState(data: TreacheryDraft, baseline: TreacheryDraft): TreacheryState {
  return { data, memory: INITIAL_TREACHERY_MEMORY, baseline };
}

function reduce(state: TreacheryState, event: TreacheryEvent): TreacheryState {
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
  const deletion = useAssetDeletion(asset);
  const groupActions = useAssetGroupActions({ asset, access });
  const { capabilities } = access.viewerAccess;
  const [chapter, setChapter] = useState<TreacheryChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft));
  const patch = (update: Partial<TreacheryDraft>) => dispatch({ kind: 'patch', update });
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'card-treachery',
    name: state.data.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Head',
    chapter: 'head' as TreacheryChapter,
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const warnings = [...treacheryDraftWarnings(state.data), ...conflictWarnings];
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';

  const save = () => {
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const payload = postedPayload(TreacheryAsset, state.data);
    updateAsset.mutate(
      { id: asset.id, data: payload },
      {
        onSuccess: ({ slug: nextSlug }) => {
          dispatch({ kind: 'saved', data: payload });
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
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'card-treachery' } }),
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
          <TreacheryCardEditor
            nameField={nameField}
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
