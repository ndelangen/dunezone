import { Alert, Anchor, Text } from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useCurrentProfile } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import {
  INITIAL_TREACHERY_DRAFT,
  TreacheryCardEditor,
  treacheryDraftWarnings,
} from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter, TreacheryDraft } from '@app/widgets/card-editor/TreacheryCardEditor';

import { AssetEditorMessage } from '../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'card-validation-header';

/** The treachery card create page. Mounted by the generic `$type/create` route when the type is `card-treachery`. */
export function TreacheryCreatePage() {
  const navigate = useNavigate();
  const profile = useCurrentProfile();
  const createAsset = useCreateAsset();
  const [draft, setDraft] = useState<TreacheryDraft>(INITIAL_TREACHERY_DRAFT);
  const [chapter, setChapter] = useState<TreacheryChapter>('head');
  const [settleTick, setSettleTick] = useState(0);
  const patch = (update: Partial<TreacheryDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = treacheryDraftWarnings(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_TREACHERY_DRAFT);
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
      <AssetEditorMessage title="New treachery card" type="card-treachery">
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to create cards.
        </Text>
      </AssetEditorMessage>
    );
  }

  const save = () => {
    createAsset.mutate(
      { type: 'card-treachery', data: draft },
      {
        onSuccess: () => void navigate({ to: '/assets/$type', params: { type: 'card-treachery' } }),
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
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
          }}
          actions={{
            onSave: save,
            onReset: () => setDraft(INITIAL_TREACHERY_DRAFT),
            onBack: () => void navigate({ to: '/assets' }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          {createAsset.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not save">
              {createAsset.error.message}
            </Alert>
          ) : null}
          <TreacheryCardEditor
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
