import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import type { ReactNode } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';

import { AssetEditorMessage, SaveErrorAlert } from '../../assetEditorStates';

/*
 * What the card create pages share: the save and the page around the workbench.
 * Each page keeps its own authoring state and reducer (D7 on «Work the editors wave»).
 */

type CardType = 'card-treachery' | 'card-spice';

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
          void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug }, replace: true });
        },
      }
    );
  return { saveState, save, error: createAsset.error };
}

/** The page around a new card's workbench, shown once the viewer is known to be signed in. */
export function CardCreateFrame({
  type,
  title,
  headerSlot,
  status,
  onSave,
  onReset,
  saveError,
  children,
}: {
  type: CardType;
  /** The page title before the card has a name, e.g. "New spice card". */
  title: string;
  headerSlot: ReactNode;
  status: { isDirty: boolean; isNameBlank: boolean; saveState: AuthoringSaveState };
  onSave: () => void;
  onReset: () => void;
  saveError: Error | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const viewer = useSessionViewer();

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
          <LoginGate action="create cards" />
        </AssetEditorMessage>
      );
    default:
      break;
  }

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
  );
}
