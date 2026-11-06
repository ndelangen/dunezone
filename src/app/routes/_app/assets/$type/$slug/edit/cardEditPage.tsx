import type { CardFrontPreset } from '@shared/assets/cardFrontPresets';
import { useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { PageState } from '@ui/block/PageState';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useAuthoringAccountKey } from '@db/authoring';
import { useAssetPage, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData, AssetPublicPage } from '@app/db/assets';
import { assetLoad } from '@app/pickers/assetLoadSource';
import type { LoadPreset } from '@app/pickers/assetLoadSource';
import { NotFoundState } from '@app/routes/routeStates';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import type { EditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { BackgroundLibrary } from '@game/assets/utils/BackgroundLibrary';

import {
  AssetEditorMessage,
  DriftedAssetPage,
  SaveErrorAlert,
  useAssetDeletion,
  useAssetGroupActions,
  AssetEditorViewerPending,
} from '../../../assetEditorStates';

/* What the card edit page is built from: the checks before a session opens, the save, and the page around the workbench; `CardTypeEditPage` holds the session. */

type CardType =
  | 'card-treachery'
  | 'card-spice'
  | 'card-custom'
  | 'card-nexus'
  | 'card-homeworld'
  | 'card-stronghold'
  | 'card-storm'
  | 'card-leaderability'
  | 'board'
  | 'token-leader';

/** How the editor pages name an asset of this type in labels and messages. */
export function assetNoun(type: CardType): 'board' | 'token' | 'card' {
  if (type === 'board') {
    return 'board';
  }
  return type === 'token-leader' ? 'token' : 'card';
}

type CardAsset = NonNullable<AssetPageData>['asset'];

/** What the editor toolbar needs to know about the viewer: what they may do, and which Groups they could hand the card to. */
type CardEditAccess = {
  viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
  assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
};

export type AssetEditSessionProps<Draft> = {
  /** The whole read, for an editor that also needs its members, back or presets. */
  page: NonNullable<AssetPageData>;
  frontPresets: CardFrontPreset[];
  asset: CardAsset;
  initialDraft: Draft;
  access: CardEditAccess;
  tokens?: NonNullable<AssetPageData>['cardTokens'];
  tokensError?: NonNullable<AssetPageData>['cardTokensError'];
};

/**
 * The checks every asset editor runs before its session opens: the asset exists, the viewer is known and may edit it, and its stored data still parses.
 * The page owns the live read, because a draft's unsaved choices (placed tokens) can decide that read's arguments.
 */
type AssetEditChecksProps<Draft> = {
  type: string;
  /** How the messages name the asset: "card", "deck", "token". */
  noun: string;
  /** The asset type as a sentence names it, e.g. "spice card". */
  schemaName: string;
  schema: z.ZodType<Draft>;
  data: AssetPageData;
  session: (props: AssetEditSessionProps<Draft>) => ReactNode;
};

/** A card editor whose read takes nothing from its draft: the read and the checks together. */
export function CardEditGate<Draft>({
  slug,
  loaderData,
  embeddedTokenIds,
  ...props
}: Omit<AssetEditChecksProps<Draft>, 'data' | 'noun' | 'type'> & {
  type: CardType;
  slug: string;
  loaderData: AssetPublicPage;
  embeddedTokenIds?: string[];
}) {
  const query = useAssetPage(props.type, slug, { initialData: loaderData, embeddedTokenIds });
  return <AssetEditChecks {...props} noun={assetNoun(props.type)} data={query.data} />;
}

export function AssetEditChecks<Draft>({ type, noun, schemaName, schema, data, session }: AssetEditChecksProps<Draft>) {
  if (data === null) {
    return (
      <AssetEditorMessage type={type} title={`Edit ${noun}`}>
        <NotFoundState noun={schemaName} renamed />
      </AssetEditorMessage>
    );
  }

  if (!data.viewerResolved) {
    return <AssetEditorViewerPending name={data.asset.name} type={type} />;
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
        <PageState kind="absent" title={`You cannot edit this ${noun}`}>
          {data.viewerAccess.assignedGroup
            ? `Only the ${noun} owner or an active member of its group can edit this ${noun}.`
            : `Only the ${noun} owner can edit this ${noun}.`}
        </PageState>
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

  /* Keyed on the asset, so moving to another one opens a fresh session rather than carrying this draft over. */
  return (
    <BackgroundLibrary key={data.asset.id} presets={data.backgrounds ?? []} fronts={data.cardFrontPresets}>
      {session({
        page: data,
        frontPresets: data.cardFrontPresets,
        asset: data.asset,
        initialDraft: parsed.data,
        tokens: data.cardTokens,
        tokensError: data.cardTokensError,
        access: { viewerAccess: data.viewerAccess, assignableGroups: data.assignableGroups },
      })}
    </BackgroundLibrary>
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
export function CardEditFrame<Draft extends { name: string }>({
  type,
  asset,
  access,
  headerSlot,
  status,
  onSave,
  onReset,
  load,
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
  /** Loading another card of this type into the draft; the card being edited is left out of the choices and keeps its name. */
  load: {
    schema: z.ZodType<Draft>;
    presets?: LoadPreset<Draft>[];
    header: Pick<EditPageHeader, 'releasing'>;
    dispatch: (action: { kind: 'replace'; data: Draft }) => void;
    /** What the page does once the loaded draft is in, such as opening its first chapter. */
    afterLoad: () => void;
  };
  saveError: Error | null;
  children: ReactNode;
}) {
  const authoringAccountKey = useAuthoringAccountKey();
  const navigate = useNavigate();
  const noun = assetNoun(type);
  const deletion = useAssetDeletion(asset);
  const groupActions = useAssetGroupActions({ asset, access });
  return (
    <PageLayout>
      {headerSlot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          scopeKey={authoringAccountKey}
          load={assetLoad({
            noun,
            type,
            schema: load.schema,
            presets: load.presets,
            editing: asset,
            canRename: access.viewerAccess.capabilities.rename,
            disabled: status.saveState === 'saving',
            onLoaded: load.header.releasing((loaded) => {
              load.dispatch({ kind: 'replace', data: loaded.data });
              load.afterLoad();
            }),
          })}
          status={status}
          copy={{
            saveLabel: `Save ${noun}`,
            nameBlankMessage: `Add a ${noun} name before saving; it determines the ${noun} URL.`,
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
              <ConfirmDeleteAction label={`Delete ${noun}`} pending={deletion.pending} onConfirm={deletion.confirm} />
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert subject={assetNoun(type)} error={saveError} />
          {deletion.error ? (
            <ActionError subject={assetNoun(type)} verb="delete">
              {deletion.error.message}
            </ActionError>
          ) : null}
          {groupActions.error}
          {children}
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
