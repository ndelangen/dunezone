import { Alert, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeader } from '@app/widgets/authoring/useValidationHeader';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import {
  INITIAL_RECTANGLE_DRAFT,
  RectangleTokenEditor,
  rectangleDraftWarnings,
} from '@app/widgets/token-editor/RectangleTokenEditor';
import type { RectangleChapter, RectangleDraft } from '@app/widgets/token-editor/RectangleTokenEditor';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

const TYPE = 'token-enhance';
const VALIDATION_HEADER_ID = 'rectangle-token-validation-header';

/**
 * The create page for an enhance token.
 * A referenced backside cannot be set here for the same reason as the round shapes: the relation needs an asset id, and there is none until the first save.
 */
export function RectangleCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [draft, setDraft] = useState<RectangleDraft>(INITIAL_RECTANGLE_DRAFT);
  const [chapter, setChapter] = useState<RectangleChapter>('identity');
  /* Armed by a save attempt while the reference has no target; disarmed the moment the state resolves. */
  const [pickBlocked, setPickBlocked] = useState(false);
  const patch = (update: Partial<RectangleDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const pickless = draft.back.mode === 'reference' && draft.back.asset_id === null;
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: TYPE,
    name: draft.name,
    onName: (name) => patch({ name }),
    source: 'Identity',
    chapter: 'identity' as RectangleChapter,
  });
  const warnings: (
    | ReturnType<typeof rectangleDraftWarnings>[number]
    | { source: string; complaint: string; chapter: RectangleChapter }
  )[] = [...rectangleDraftWarnings(draft), ...conflictWarnings];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_RECTANGLE_DRAFT);
  const isNameBlank = !draft.name.trim();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const validationHeader = useValidationHeader(warnings.length);

  switch (viewer.kind) {
    case 'pending':
      return (
        <AssetEditorMessage title="New enhance token" type={TYPE}>
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title="New enhance token" type={TYPE}>
          <LoginGate action="create tokens" />
        </AssetEditorMessage>
      );
    default:
      break;
  }

  const save = () => {
    /* The reference tile can be chosen here but not filled (picking waits for the edit page), so the save says so with words rather than a Zod error. */
    if (pickless) {
      setPickBlocked(true);
      return;
    }
    setPickBlocked(false);
    createAsset.mutate(
      { type: TYPE, data: draft },
      {
        onSuccess: ({ slug }) =>
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: TYPE, slug }, replace: true }),
      }
    );
  };

  return (
    <PageLayout>
      {validationHeader.open ? (
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
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
          }}
          actions={{
            onSave: save,
            onReset: validationHeader.releasing(() => setDraft(INITIAL_RECTANGLE_DRAFT)),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: TYPE } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          {pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No token picked">
              Picking a token's back happens on the edit page; save with another back mode first.
            </Alert>
          ) : null}
          <RectangleTokenEditor
            nameField={nameField}
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={validationHeader.settle}
            backPicker={() => (
              <Text size="xs" c="dimmed">
                A token can point at an existing token only once it has been saved.
              </Text>
            )}
            backProof={null}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
