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
import { bundleDraftWarnings, BundleEditor, INITIAL_BUNDLE_DRAFT } from '@app/widgets/bundle-editor/BundleEditor';
import type { BundleChapter, BundleDraft } from '@app/widgets/bundle-editor/BundleEditor';

import { AssetEditorMessage } from '../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'bundle-validation-header';

/**
 * The bundle create page.
 * Tokens cannot be added here: membership is `asset_relations` rows keyed on the bundle's id, and there is no id until the first save.
 * The Tokens chapter says so rather than offering steppers that cannot write.
 */
export function BundleCreatePage() {
  const navigate = useNavigate();
  const profile = useCurrentProfile();
  const createAsset = useCreateAsset();
  const [draft, setDraft] = useState<BundleDraft>(INITIAL_BUNDLE_DRAFT);
  const [chapter, setChapter] = useState<BundleChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const patch = (update: Partial<BundleDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = bundleDraftWarnings(draft, []).filter((warning) => warning.chapter !== 'tokens');
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_BUNDLE_DRAFT);
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
      <AssetEditorMessage title="New bundle" type="bundle">
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to create
          bundles.
        </Text>
      </AssetEditorMessage>
    );
  }

  const save = () => {
    createAsset.mutate(
      { type: 'bundle', data: draft },
      { onSuccess: ({ slug }) => void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'bundle', slug } }) }
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
            saveLabel: 'Save bundle',
            nameBlankMessage: 'Add a bundle name before saving; it determines the bundle URL.',
            /* No publication copy anywhere on this page: a bundle publishes nothing, and its members publish themselves. */
          }}
          actions={{
            onSave: save,
            onReset: () => setDraft(INITIAL_BUNDLE_DRAFT),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'bundle' } }),
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
          <BundleEditor
            draft={draft}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
            members={[]}
            onCountChange={null}
            tokenPicker={
              <Text size="xs" c="dimmed">
                Tokens can be added once the bundle has been saved.
              </Text>
            }
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
