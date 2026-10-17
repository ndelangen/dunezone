import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import { useReducer, useState } from 'react';

import type { AssetPublicPage } from '@app/db/assets';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { LeaderSkillCardEditor, leaderSkillDraftWarnings } from '@app/widgets/card-editor/LeaderSkillCardEditor';
import type { LeaderSkillChapter, LeaderSkillDraft } from '@app/widgets/card-editor/LeaderSkillCardEditor';
import { LeaderSkillAsset } from '@game/data/objects';

import { assetNameField } from '../../../assetEditorStates';
import { openingLeaderSkillState, reduceLeaderSkill, leaderSkillDraftStatus } from '../../../leaderSkillEditingSession';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

/** The leader skill card edit page, mounted by the generic asset edit route. */
export function LeaderSkillEditPage({ slug, loaderData }: Readonly<{ slug: string; loaderData: AssetPublicPage }>) {
  return (
    <CardEditGate
      type="card-leaderability"
      schemaName="leader skill card"
      schema={LeaderSkillAsset}
      slug={slug}
      loaderData={loaderData}
      session={renderSession}
    />
  );
}

function renderSession(props: CardEditSessionProps<LeaderSkillDraft>) {
  return <CardEditSession {...props} />;
}

function CardEditSession({
  frontPresets,
  asset,
  initialDraft,
  access,
}: Readonly<CardEditSessionProps<LeaderSkillDraft>>) {
  const saving = useCardSave('card-leaderability', asset);
  const [overflow, setOverflow] = useState(false);
  const [chapter, setChapter] = useState<LeaderSkillChapter>('head');
  const [state, dispatch] = useReducer(reduceLeaderSkill, undefined, () =>
    openingLeaderSkillState(initialDraft, initialDraft)
  );
  const patch = (update: Partial<LeaderSkillDraft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: leaderSkillDraftWarnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { payload, ...status } = leaderSkillDraftStatus(state, overflow);
  const save = () => {
    if (payload) {
      saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  return (
    <CardEditFrame
      type="card-leaderability"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{
        isDirty: status.isDirty,
        isNameBlank: !state.data.name.trim(),
        saveState: saving.saveState,
        invalid: status.invalid,
      }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      load={{
        schema: LeaderSkillAsset,
        /* The edited card keeps its name, so loading never moves it to another address. */
        onLoaded: header.releasing((data) => {
          dispatch({ kind: 'replace', data: { ...data, name: state.data.name } });
          setChapter('head');
        }),
      }}
      saveError={saving.error}
    >
      <LeaderSkillCardEditor
        frontStyle={cardFrontStyleFor('card-leaderability', state.data, frontPresets)}
        nameField={nameField}
        draft={state.data}
        patch={patch}
        memory={state.memory}
        remember={(update) => dispatch({ kind: 'remember', update })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
        onOverflow={setOverflow}
      />
    </CardEditFrame>
  );
}
