import { EMPTY_LEADER_TOKEN, DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { LeaderTokenAssetInput } from '@shared/assets/schema';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { useCreateAsset } from '@db/assets';
import { useAuthoringAccountKey } from '@db/authoring';
import { useSessionViewer } from '@db/profiles';
import { assetLoad } from '@app/pickers/assetLoadSource';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { LeaderTokenEditor, leaderTokenDraftWarnings } from '@app/widgets/token-editor/LeaderTokenEditor';
import type { LeaderTokenChapter, LeaderTokenDraft } from '@app/widgets/token-editor/LeaderTokenEditor';

import { AssetEditorMessage, SaveErrorAlert, assetNameField } from '../../assetEditorStates';
import { openingLeaderTokenState, reduceLeaderTokenDraft, leaderTokenDraftStatus } from '../leaderTokenAuthoring';

const TYPE = 'token-leader';

export function LeaderTokenCreatePage() {
  const authoringAccountKey = useAuthoringAccountKey();
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<LeaderTokenChapter>('identity');
  const [state, dispatch] = useReducer(reduceLeaderTokenDraft, undefined, () =>
    openingLeaderTokenState(EMPTY_LEADER_TOKEN, EMPTY_LEADER_TOKEN)
  );
  const patch = (update: Partial<LeaderTokenDraft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: leaderTokenDraftWarnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { isDirty, invalid, payload } = leaderTokenDraftStatus(state);
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  if (viewer.kind === 'pending') {
    return (
      <AssetEditorMessage title="New leader token" type={TYPE}>
        <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
      </AssetEditorMessage>
    );
  }
  if (viewer.kind === 'signed-out') {
    return (
      <AssetEditorMessage title="New leader token" type={TYPE}>
        <LoginGate action="create tokens" />
      </AssetEditorMessage>
    );
  }
  const save = () => {
    if (!payload) {
      return;
    }
    createAsset.mutate(
      { type: TYPE, data: payload },
      {
        onSuccess: ({ slug }) =>
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: TYPE, slug }, replace: true }),
      }
    );
  };
  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          scopeKey={authoringAccountKey}
          load={assetLoad({
            noun: 'token',
            type: TYPE,
            schema: LeaderTokenAssetInput,
            disabled: saveState === 'saving',
            presets: [{ label: 'Duke Prad Vidal', name: DUKE_PRAD_VIDAL_TOKEN.name, data: DUKE_PRAD_VIDAL_TOKEN }],
            onLoaded: header.releasing(({ data }) => {
              dispatch({ kind: 'replace', data });
              setChapter('identity');
            }),
          })}
          status={{ isDirty, invalid, isNameBlank: !state.data.name.trim(), saveState }}
          copy={{
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline })),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: TYPE } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          <LeaderTokenEditor
            nameField={assetNameField({ canRename: true, name: state.data.name, onName: (name) => patch({ name }) })}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
