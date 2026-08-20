import { Alert, Anchor, Stack, Text } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { useState } from 'react';

import { useCurrentProfile } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { initialTokenDraft, TokenEditor, tokenDraftWarnings } from '@app/widgets/token-editor/TokenEditor';
import type { TokenChapter, TokenDraft } from '@app/widgets/token-editor/TokenEditor';

import { AssetEditorMessage } from '../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'token-validation-header';

/**
 * The create page for every token shape.
 * A referenced backside cannot be set here: the relation needs an asset id, and there is none until the first save, so creation always starts from a custom back and the edit page offers the choice.
 */
export function TokenCreatePage({ type }: { type: string }) {
  const navigate = useNavigate();
  const profile = useCurrentProfile();
  const createAsset = useCreateAsset();
  const initialDraft = initialTokenDraft(type);
  const [draft, setDraft] = useState<TokenDraft>(initialDraft);
  const [chapter, setChapter] = useState<TokenChapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const label = isAssetType(type) ? ASSET_TYPES[type].shortLabel.toLowerCase() : 'token';
  const patch = (update: Partial<TokenDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = tokenDraftWarnings(draft, false);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
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
      <AssetEditorMessage title={`New ${label} token`} type={type}>
        <Text>
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to create tokens.
        </Text>
      </AssetEditorMessage>
    );
  }

  const save = () => {
    createAsset.mutate(
      { type, data: draft },
      { onSuccess: ({ slug }) => void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug } }) }
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
            onReset: () => setDraft(initialDraft),
            onBack: () => void navigate({ to: '/assets/$type', params: { type } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="sm" style={{ width: '100%', maxWidth: '78rem', margin: '0 auto' }}>
          {createAsset.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not save">
              {createAsset.error.message}
            </Alert>
          ) : null}
          <TokenEditor
            draft={draft}
            patch={patch}
            type={type}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={() => setSettleTick((tick) => tick + 1)}
            backPicker={
              <Text size="xs" c="dimmed">
                A token can point at an existing token only once it has been saved.
              </Text>
            }
            backProof={null}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
