import { useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { HoldAction } from '@ui/control/HoldAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useAuthoringAccountKey } from '@db/authoring';
import { useAssetPage, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData, AssetPublicPage } from '@app/db/assets';
import { assetLoad } from '@app/pickers/assetLoadSource';
import type { LoadPreset } from '@app/pickers/assetLoadSource';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import type { EditPageHeader } from '@app/widgets/authoring/useEditPageHeader';

import { AssetEditChecks, useAssetDeletion, useAssetGroupActions } from '../../../assetEditorStates';
import type { AssetEditAccess, AssetEditChecksProps } from '../../../assetEditorStates';

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
  access: AssetEditAccess;
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
              <HoldAction label={`Delete ${noun}`} pending={deletion.pending} onConfirm={deletion.confirm} />
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <ActionError verb="save" subject={assetNoun(type)} error={saveError} />
          <ActionError subject={assetNoun(type)} verb="delete" error={deletion.error} />
          {groupActions.error}
          {children}
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
