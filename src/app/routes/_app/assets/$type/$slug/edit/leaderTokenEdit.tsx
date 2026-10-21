import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { LeaderTokenAssetInput } from '@shared/assets/schema';
import { useReducer, useState } from 'react';

import type { AssetPublicPage } from '@db/assets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { LeaderTokenEditor, leaderTokenDraftWarnings } from '@app/widgets/token-editor/LeaderTokenEditor';
import type { LeaderTokenChapter, LeaderTokenDraft } from '@app/widgets/token-editor/LeaderTokenEditor';

import { assetNameField } from '../../../assetEditorStates';
import { openingLeaderTokenState, reduceLeaderTokenDraft, leaderTokenDraftStatus } from '../../leaderTokenAuthoring';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

export function LeaderTokenEditPage({ slug, loaderData }: Readonly<{ slug: string; loaderData: AssetPublicPage }>) {
  return (
    <CardEditGate
      type="token-leader"
      schemaName="leader token"
      schema={LeaderTokenAssetInput}
      slug={slug}
      loaderData={loaderData}
      session={renderSession}
    />
  );
}
function renderSession(props: Readonly<CardEditSessionProps<LeaderTokenDraft>>) {
  return <LeaderTokenEditSession {...props} />;
}
function LeaderTokenEditSession({ asset, initialDraft, access }: Readonly<CardEditSessionProps<LeaderTokenDraft>>) {
  const saving = useCardSave('token-leader', asset);
  const [chapter, setChapter] = useState<LeaderTokenChapter>('identity');
  const [state, dispatch] = useReducer(reduceLeaderTokenDraft, undefined, () =>
    openingLeaderTokenState(initialDraft, initialDraft)
  );
  const patch = (update: Partial<LeaderTokenDraft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: leaderTokenDraftWarnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { isDirty, invalid, payload } = leaderTokenDraftStatus(state);
  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };
  return (
    <CardEditFrame
      type="token-leader"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, invalid, isNameBlank: !state.data.name.trim(), saveState: saving.saveState }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: LeaderTokenAssetInput,
        presets: [{ label: 'Duke Prad Vidal', name: DUKE_PRAD_VIDAL_TOKEN.name, data: DUKE_PRAD_VIDAL_TOKEN }],
        header,
        dispatch,
        afterLoad: () => setChapter('identity'),
      }}
      saveError={saving.error}
    >
      <LeaderTokenEditor
        nameField={assetNameField({
          canRename: access.viewerAccess.capabilities.rename,
          name: state.data.name,
          onName: (name) => patch({ name }),
          noun: 'token',
        })}
        draft={state.data}
        patch={patch}
        memory={state.memory}
        remember={(update) => dispatch({ kind: 'remember', update })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
      />
    </CardEditFrame>
  );
}
