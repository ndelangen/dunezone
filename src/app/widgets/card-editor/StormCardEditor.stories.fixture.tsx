import { Button, TextInput } from '@mantine/core';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { StormCardEditor, INITIAL_STORM_CARD_MEMORY } from './StormCardEditor';
import type { StormCardChapter, StormCardDraft, StormCardMemory } from './StormCardEditor';

export function InteractiveEditor({ sectors = 1 }: { sectors?: number }) {
  const [state, dispatch] = useReducer(
    (
      current: { draft: StormCardDraft; memory: StormCardMemory },
      event: {
        draft?: Partial<StormCardDraft>;
        memory?: Partial<StormCardMemory>;
      }
    ) => ({
      draft: { ...current.draft, ...event.draft },
      memory: { ...current.memory, ...event.memory },
    }),
    { draft: standardStormCard(sectors), memory: INITIAL_STORM_CARD_MEMORY }
  );
  const [chapter, setChapter] = useState<StormCardChapter>('head');
  return (
    <WorkbenchLayout>
      <StormCardEditor
        draft={state.draft}
        patch={(draft) => dispatch({ draft })}
        memory={state.memory}
        remember={(memory) => dispatch({ memory })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
        tokens={{}}
        tokenPicker={(_onPick, onCancel) => <Button onClick={onCancel}>Cancel</Button>}
        nameField={
          <TextInput
            aria-label="Name"
            value={state.draft.name}
            onChange={(event) => dispatch({ draft: { name: event.currentTarget.value } })}
          />
        }
      />
    </WorkbenchLayout>
  );
}
