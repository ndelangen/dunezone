import { TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import { LeaderTokenEditor } from './LeaderTokenEditor';
import type { LeaderTokenChapter, LeaderTokenDraft, LeaderTokenMemory } from './LeaderTokenEditor';

function Editor() {
  const [state, dispatch] = useReducer(
    (
      current: { draft: LeaderTokenDraft; memory: LeaderTokenMemory },
      event:
        | { kind: 'patch'; update: Partial<LeaderTokenDraft> }
        | { kind: 'remember'; update: Partial<LeaderTokenMemory> }
    ) => {
      switch (event.kind) {
        case 'patch':
          return { ...current, draft: { ...current.draft, ...event.update } };
        case 'remember':
          return { ...current, memory: { ...current.memory, ...event.update } };
      }
    },
    { draft: DUKE_PRAD_VIDAL_TOKEN, memory: { declaredCustom: false, backgroundMode: emptyBackgroundModeMemory() } }
  );
  const [chapter, setChapter] = useState<LeaderTokenChapter>('identity');
  return (
    <WorkbenchLayout>
      <LeaderTokenEditor
        nameField={
          <TextInput
            aria-label="Name"
            value={state.draft.name}
            onChange={(event) => dispatch({ kind: 'patch', update: { name: event.currentTarget.value } })}
          />
        }
        draft={state.draft}
        patch={(draft) => dispatch({ kind: 'patch', update: draft })}
        memory={state.memory}
        remember={(memory) => dispatch({ kind: 'remember', update: memory })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
      />
    </WorkbenchLayout>
  );
}
const meta = preview.meta({ title: 'Leader Token Editor', component: Editor, parameters: { layout: 'padded' } });
export const DukePradVidal = meta.story({});
