import { Text, TextInput } from '@mantine/core';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';
import type { ReactNode } from 'react';

import { initialTokenDraft, initialTokenMemory, TokenEditor } from './TokenEditor';
import type { TokenChapter, TokenDraft, TokenMemory } from './TokenEditor';

export const DISC = 'token-disc';

export function discDraftWith(back: TokenDraft['back']): TokenDraft {
  const draft = initialTokenDraft(DISC);
  return { ...draft, name: 'Spice Blow', front: { ...draft.front, top: 'SPICE', bottomFirst: 'BLOW' }, back };
}

/**
 * The editor as a page installs it: inside the workbench's capped column, holding its own draft so every chapter and tile works.
 * Without the layout the widget collapsed to its content under Storybook's centred canvas, and its chapters, proofs and name field were drawn on top of one another.
 */
export function InteractiveEditor({
  type,
  draft: starting,
  chapter: startingChapter = 'identity',
  backProof = null,
}: {
  type: string;
  draft: TokenDraft;
  chapter?: TokenChapter;
  /** What a referenced back shows, which a page reads from the referenced token and a story hands over. */
  backProof?: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    (
      current: { draft: TokenDraft; memory: TokenMemory },
      event: { draft?: Partial<TokenDraft>; memory?: Partial<TokenMemory> }
    ) => ({ draft: { ...current.draft, ...event.draft }, memory: { ...current.memory, ...event.memory } }),
    { draft: starting, memory: initialTokenMemory(starting.back) }
  );
  const [chapter, setChapter] = useState<TokenChapter>(startingChapter);
  return (
    <WorkbenchLayout>
      <TokenEditor
        nameField={
          <TextInput
            aria-label="Name"
            value={state.draft.name}
            onChange={(event) => dispatch({ draft: { name: event.currentTarget.value } })}
          />
        }
        type={type}
        draft={state.draft}
        patch={(draft) => dispatch({ draft })}
        memory={state.memory}
        remember={(memory) => dispatch({ memory })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
        backPicker={() => <Text size="xs">Choose a token…</Text>}
        backProof={backProof}
      />
    </WorkbenchLayout>
  );
}
