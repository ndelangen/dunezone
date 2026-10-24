import { Button, TextInput } from '@mantine/core';
import { publishingCustomCardTokens } from '@shared/assets/fixtures/publishingCustomCardTokens';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { CustomCardEditor, INITIAL_CUSTOM_CARD_DRAFT, INITIAL_CUSTOM_CARD_MEMORY } from './CustomCardEditor';
import type { CustomCardChapter, CustomCardDraft, CustomCardMemory } from './CustomCardEditor';
import { CUSTOM_CARD_PRESETS } from './customCardPresets';

export function InteractiveEditor({
  preset,
  name = 'Custom card',
  layers,
}: {
  preset: string;
  name?: string;
  layers?: CustomCardDraft['layers'];
}) {
  const starting = CUSTOM_CARD_PRESETS.find((candidate) => candidate.key === preset)!;
  const [state, dispatch] = useReducer(
    (
      current: { draft: CustomCardDraft; memory: CustomCardMemory },
      event: { draft?: Partial<CustomCardDraft>; memory?: Partial<CustomCardMemory> }
    ) => ({ draft: { ...current.draft, ...event.draft }, memory: { ...current.memory, ...event.memory } }),
    {
      draft: {
        ...INITIAL_CUSTOM_CARD_DRAFT,
        name,
        subName: preset === 'treachery' ? 'Weapon - Projectile' : 'Reference',
        format: starting.format,
        layers: structuredClone(layers ?? starting.layers),
      },
      memory: INITIAL_CUSTOM_CARD_MEMORY,
    }
  );
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  return (
    <WorkbenchLayout>
      <CustomCardEditor
        tokens={{
          ...publishingCustomCardTokens,
          'sample-token': { type: 'token-disc', name: 'Karama token', face: publishingTokenFace },
        }}
        tokenPicker={(onPick, onCancel) => (
          <>
            <Button onClick={() => onPick('sample-token')}>Pick Karama token</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </>
        )}
        nameField={
          <TextInput
            aria-label="Name"
            value={state.draft.name}
            onChange={(event) => dispatch({ draft: { name: event.currentTarget.value } })}
          />
        }
        draft={state.draft}
        patch={(draft) => dispatch({ draft })}
        memory={state.memory}
        remember={(memory) => dispatch({ memory })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
      />
    </WorkbenchLayout>
  );
}
