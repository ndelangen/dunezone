import type { CardFrontPreset } from '@shared/assets/cardFrontPresets';
import type { SharedBackgroundPreset } from '@shared/backgrounds/schema';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useAuthoringAccountKey } from '@db/authoring';
import { useAuthoringPresets } from '@db/backgroundPresets';
import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { assetLoad } from '@app/pickers/assetLoadSource';
import type { LoadPreset } from '@app/pickers/assetLoadSource';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { BackgroundLibrary } from '@game/assets/utils/BackgroundLibrary';

import { AssetEditorMessage, SaveErrorAlert } from '../../assetEditorStates';

/*
 * What the card create pages share: the save and the page around the workbench.
 * Each page keeps its own authoring state and reducer (D7 on «Work the editors wave»).
 */

type CardType =
  | 'card-treachery'
  | 'card-spice'
  | 'card-custom'
  | 'card-nexus'
  | 'card-homeworld'
  | 'card-stronghold'
  | 'card-storm'
  | 'card-leaderability'
  | 'token-leader';

/** Posts a new card and opens its edit page once it has an address. */
export function useCardCreate(type: CardType) {
  const navigate = useNavigate();
  const createAsset = useCreateAsset();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const save = (payload: object, onSaved: () => void) =>
    createAsset.mutate(
      { type, data: payload },
      {
        onSuccess: ({ slug }) => {
          onSaved();
          void navigate({
            to: '/assets/$type/$slug/edit',
            params: { type, slug },
            replace: true,
          });
        },
      }
    );
  return { saveState, save, error: createAsset.error };
}

/** The page around a new card's workbench, shown once the viewer is known to be signed in. */
export function CardCreateFrame<Draft extends { name: string }>({
  type,
  title,
  headerSlot,
  status,
  onSave,
  onReset,
  load,
  saveError,
  children,
  backgrounds,
  fronts,
  loadingPresets = false,
}: {
  type: CardType;
  /** The page title before the card has a name, e.g. "New spice card". */
  title: string;
  headerSlot: ReactNode;
  status: {
    isDirty: boolean;
    isNameBlank: boolean;
    saveState: AuthoringSaveState;
    invalid?: string;
  };
  onSave: () => void;
  onReset: () => void;
  load: { schema: z.ZodType<Draft>; presets?: LoadPreset<Draft>[]; onLoaded: (draft: Draft) => void };
  saveError: Error | null;
  children: ReactNode;
  backgrounds?: SharedBackgroundPreset[];
  fronts?: CardFrontPreset[];
  loadingPresets?: boolean;
}) {
  const authoringAccountKey = useAuthoringAccountKey();
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const standards = useAuthoringPresets(backgrounds === undefined);
  const noun = type === 'token-leader' ? 'token' : 'card';

  switch (viewer.kind) {
    case 'pending':
      return (
        <AssetEditorMessage title={title} type={type}>
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title={title} type={type}>
          <LoginGate action={`create ${noun}s`} />
        </AssetEditorMessage>
      );
    default:
      break;
  }

  if (loadingPresets || (backgrounds === undefined && !standards)) {
    return (
      <AssetEditorMessage title={title} type={type}>
        <LoadPending title="Loading presets">Loading the current design standards.</LoadPending>
      </AssetEditorMessage>
    );
  }

  return (
    <BackgroundLibrary presets={backgrounds ?? standards?.backgrounds ?? []} fronts={fronts ?? standards?.fronts}>
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
              disabled: status.saveState === 'saving',
              onLoaded: (loaded) => load.onLoaded(loaded.data),
            })}
            status={status}
            copy={{
              saveLabel: `Save ${noun}`,
              nameBlankMessage: `Add a ${noun} name before saving; it determines the ${noun} URL.`,
            }}
            actions={{
              onSave,
              onReset,
              onBack: () => void navigate({ to: '/assets/$type', params: { type } }),
            }}
          />
        </PageLayout.Toolbar>
        <PageLayout.Content>
          <WorkbenchLayout gap="sm">
            <SaveErrorAlert error={saveError} />
            {children}
          </WorkbenchLayout>
        </PageLayout.Content>
      </PageLayout>
    </BackgroundLibrary>
  );
}
