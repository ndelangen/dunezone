import { Alert } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useAssetPage, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
} from '../../../assetEditorStates';

/*
 * What the card edit pages share: the checks before a session opens, the save, and the page around the workbench.
 * Each page keeps its own authoring state and reducer (D7 on «Work the editors wave»).
 */

type CardType = 'card-treachery' | 'card-spice' | 'card-custom' | 'board';

type CardAsset = NonNullable<AssetPageData>['asset'];

/** What the editor toolbar needs to know about the viewer: what they may do, and which Groups they could hand the card to. */
type CardEditAccess = {
  viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
  assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
};

export type CardEditSessionProps<Draft> = {
  asset: CardAsset;
  initialDraft: Draft;
  access: CardEditAccess;
  tokens?: NonNullable<AssetPageData>['cardTokens'];
  tokensError?: NonNullable<AssetPageData>['cardTokensError'];
};

/** Opens the session only for a card that exists, a viewer who may edit it, and stored data that still parses. */
type CardEditGateProps<Draft> = {
  type: CardType;
  /** The card type as a sentence names it, e.g. "spice card". */
  schemaName: string;
  schema: z.ZodType<Draft>;
  slug: string;
  loaderData: AssetPageData;
  embeddedTokenIds?: string[];
  session: (props: CardEditSessionProps<Draft>) => ReactNode;
};

export function CardEditGate<Draft>(props: CardEditGateProps<Draft>) {
  const query = useAssetPage(props.type, props.slug, {
    initialData: props.loaderData,
    embeddedTokenIds: props.embeddedTokenIds,
  });
  return <CardEditChecks {...props} data={query.data === undefined ? props.loaderData : query.data} />;
}

/** The custom page owns the live read because its unsaved Token layers determine that read's arguments. */
export function CardEditChecks<Draft>({
  type,
  schemaName,
  schema,
  data,
  session,
}: Omit<CardEditGateProps<Draft>, 'slug' | 'loaderData' | 'embeddedTokenIds'> & { data: AssetPageData }) {
  const noun = type === 'board' ? 'board' : 'card';
  if (data === null) {
    return (
      <AssetEditorMessage type={type} title={`Edit ${noun}`}>
        <NotAvailable
          title={type === 'board' ? 'Board not found' : 'Card not found'}
        >{`No ${schemaName} lives at this address.`}</NotAvailable>
      </AssetEditorMessage>
    );
  }

  if (data.viewerAccess.viewer.kind === 'anonymous') {
    return (
      <AssetEditorMessage type={type} title={`Edit ${data.asset.name}`}>
        <LoginGate action={`edit ${noun}s`} />
      </AssetEditorMessage>
    );
  }

  if (!data.viewerAccess.capabilities.edit) {
    return (
      <AssetEditorMessage type={type} title={`Edit ${data.asset.name}`}>
        <NotAvailable title={`You cannot edit this ${noun}`}>
          {data.viewerAccess.assignedGroup
            ? `Only the ${noun} owner or an active member of its group can edit this ${noun}.`
            : `Only the ${noun} owner can edit this ${noun}.`}
        </NotAvailable>
      </AssetEditorMessage>
    );
  }

  const parsed = schema.safeParse(data.asset.data);
  if (!parsed.success) {
    return (
      <DriftedAssetPage asset={data.asset} noun={noun} canDelete={data.viewerAccess.capabilities.delete}>
        {`This ${noun}'s stored data no longer matches the ${schemaName} schema, so it cannot be edited here.`}
      </DriftedAssetPage>
    );
  }

  /* Keyed on the card, so moving to another card opens a fresh session rather than carrying this draft over. */
  return (
    <Fragment key={data.asset.id}>
      {session({
        asset: data.asset,
        initialDraft: parsed.data,
        tokens: data.cardTokens,
        tokensError: data.cardTokensError,
        access: { viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups },
      })}
    </Fragment>
  );
}

/** Posts a card's payload, reports the save state, and follows a rename to the card's new URL. */
export function useCardSave(type: CardType, asset: CardAsset) {
  const navigate = useNavigate();
  const updateAsset = useUpdateAsset();
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const save = (payload: object, onSaved: () => void) =>
    updateAsset.mutate(
      { id: asset.id, data: payload },
      {
        onSuccess: ({ slug: nextSlug }) => {
          onSaved();
          /* Renames re-slug: follow the card to its new URL so a reload keeps editing it. */
          if (nextSlug !== asset.slug) {
            void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug: nextSlug }, replace: true });
          }
        },
      }
    );
  return { saveState, save, error: updateAsset.error };
}

/** The page around a card workbench: the warnings header, the toolbar, and the save, delete and group errors. */
export function CardEditFrame({
  type,
  asset,
  access,
  headerSlot,
  status,
  onSave,
  onReset,
  saveError,
  children,
}: {
  type: CardType;
  asset: CardAsset;
  access: CardEditAccess;
  headerSlot: ReactNode;
  status: { isDirty: boolean; isNameBlank: boolean; saveState: AuthoringSaveState; invalid?: string };
  onSave: () => void;
  onReset: () => void;
  saveError: Error | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const deletion = useAssetDeletion(asset);
  const groupActions = useAssetGroupActions({ asset, access });
  return (
    <PageLayout>
      {headerSlot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={status}
          copy={{
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
          }}
          actions={{
            onSave,
            onReset,
            onBack: () => void navigate({ to: '/assets/$type/$slug', params: { type, slug: asset.slug } }),
          }}
          accessActions={groupActions.accessActions}
          statuses={[groupActions.status]}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <ConfirmDeleteAction label="Delete card" pending={deletion.pending} onConfirm={deletion.confirm} />
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={saveError} />
          {deletion.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deletion.error.message}
            </Alert>
          ) : null}
          {groupActions.error}
          {children}
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
