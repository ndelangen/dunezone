import { EMPTY_LEADER_TOKEN, DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { LeaderTokenAssetInput } from '@shared/assets/schema';

import { LeaderTokenEditor } from '@app/widgets/token-editor/LeaderTokenEditor';

import { assetNameField } from '../../assetEditorStates';
import { useLeaderTokenAuthoring } from '../leaderTokenAuthoring';
import { CardCreateFrame, useCardCreate } from './cardCreatePage';

export function LeaderTokenCreatePage() {
  const saving = useCardCreate('token-leader');
  const { state, dispatch, patch, header, chapter, setChapter, isDirty, invalid, save } = useLeaderTokenAuthoring(
    EMPTY_LEADER_TOKEN,
    saving.save
  );
  return (
    <CardCreateFrame
      type="token-leader"
      title="New leader token"
      headerSlot={header.slot}
      status={{ isDirty, invalid, isNameBlank: !state.data.name.trim(), saveState: saving.saveState }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: LeaderTokenAssetInput,
        presets: [{ label: 'Duke Prad Vidal', name: DUKE_PRAD_VIDAL_TOKEN.name, data: DUKE_PRAD_VIDAL_TOKEN }],
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data });
          setChapter('identity');
        }),
      }}
      saveError={saving.error}
    >
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
    </CardCreateFrame>
  );
}
