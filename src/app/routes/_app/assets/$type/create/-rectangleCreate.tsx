import { Alert, Anchor, Text } from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useCurrentProfile } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { mutationErrorMessage } from '@app/db/core/mutationError';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import {
  INITIAL_RECTANGLE_DRAFT,
  RectangleTokenEditor,
  rectangleDraftWarnings,
} from '@app/widgets/token-editor/RectangleTokenEditor';
import type { RectangleChapter, RectangleDraft } from '@app/widgets/token-editor/RectangleTokenEditor';

import { AssetEditorMessage, useNameConflict } from '../../-assetEditorStates';

const TYPE = 'token-enhance';
const VALIDATION_HEADER_ID = 'rectangle-token-validation-header';

/**
 * The create page for an enhance token.
 * A referenced backside cannot be set here for the same reason as the round shapes: the relation needs an asset id, and there is none until the first save.
 */
export function RectangleCreatePage() {
  const navigate = useNavigate();
  const profile = useCurrentProfile();
  const createAsset = useCreateAsset();
  const [draft, setDraft] = useState<RectangleDraft>(INITIAL_RECTANGLE_DRAFT);
  const [chapter, setChapter] = useState<RectangleChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  /* Armed by a save attempt while the reference has no target; disarmed the moment the state resolves. */
  const [pickBlocked, setPickBlocked] = useState(false);
  const patch = (update: Partial<RectangleDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const pickless = draft.back.mode === 'reference' && draft.back.asset_id === null;
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const conflictSlug = useNameConflict({ type: TYPE, name: draft.name });
  const warnings: (
    | ReturnType<typeof rectangleDraftWarnings>[number]
    | { source: string; complaint: string; chapter: RectangleChapter }
  )[] = [
    ...rectangleDraftWarnings(draft),
    ...(conflictSlug
      ? [
          {
            source: 'Identity',
            complaint: `its name is already taken (another one lives at "${conflictSlug}")`,
            chapter: 'identity' as RectangleChapter,
          },
        ]
      : []),
  ];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_RECTANGLE_DRAFT);
  const isNameBlank = !draft.name.trim();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const validationHeaderOpen = useValidationHeaderOpen(warnings.length, settleTick);

  if (profile.data === null) {
    return (
      <AssetEditorMessage title="New enhance token" type={TYPE}>
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to create tokens.
        </Text>
      </AssetEditorMessage>
    );
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
      {validationHeaderOpen ? (
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
            onReset: () => setDraft(INITIAL_RECTANGLE_DRAFT),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: TYPE } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          {createAsset.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not save">
              {mutationErrorMessage(createAsset.error)}
            </Alert>
          ) : null}
          {pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No token picked">
              Picking a token's back happens on the edit page; save with another back mode first.
            </Alert>
          ) : null}
          <RectangleTokenEditor
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
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
