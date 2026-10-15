import { Text, TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';

import { initialTokenDraft, initialTokenMemory, TokenEditor, TokenProof } from './TokenEditor';
import type { TokenChapter, TokenDraft, TokenMemory } from './TokenEditor';

const DISC = 'token-disc';

function discDraftWith(back: TokenDraft['back']): TokenDraft {
  const draft = initialTokenDraft(DISC);
  return { ...draft, name: 'Spice Blow', front: { ...draft.front, top: 'SPICE', bottomFirst: 'BLOW' }, back };
}

const pointerDraft = (() => {
  const draft = initialTokenDraft('token-pointer');
  const front = { ...draft.front, top: 'HMS', bottomFirst: 'HUNTER', bottomSecond: 'SEEKER' };
  return { ...draft, name: 'HMS', front, back: { mode: 'custom' as const, face: front } };
})();

/**
 * The editor as a page installs it: inside the workbench's capped column, holding its own draft so every chapter and tile works.
 * Without the layout the widget collapsed to its content under Storybook's centred canvas, and its chapters, proofs and name field were drawn on top of one another.
 */
function InteractiveEditor({
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

const meta = preview.meta({
  title: 'Token Editor',
  component: InteractiveEditor,
  parameters: { layout: 'padded' },
  globals: { colorScheme: 'dark' },
  args: {
    type: DISC,
    draft: discDraftWith(initialTokenDraft(DISC).back),
  },
});

/** The back composed here: the Composed tile draws it, and the Back chapters edit it. */
export const BackComposedHere = meta.story({});

/** One artwork printed both sides: the Same tile draws the front, because that is what the mode produces. */
export const BackSameAsFront = meta.story({
  args: { draft: discDraftWith({ mode: 'same' }) },
});

/** Worn from another token: the picker lives inside the chosen tile rather than beside the row. */
export const BackFromAnotherToken = meta.story({
  args: {
    draft: discDraftWith({ mode: 'reference', asset_id: 'another-token' }),
    backProof: <TokenProof face={initialTokenDraft(DISC).front} type={DISC} />,
  },
});

/** Chosen but not yet picked, which is the state the draft holds between the tile and the pick. */
export const BackReferenceNotYetPicked = meta.story({
  args: { draft: discDraftWith({ mode: 'reference', asset_id: null }) },
});

/** Raster illustrations stay in card editors while token symbols use SVG fragments. */
export const FrontSymbols = meta.story({
  args: { chapter: 'front' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Symbol' }));
    await expect(screen.getByRole('group', { name: 'Decals / Custom stronghold illustrations' })).toBeVisible();
    await expect(screen.queryByRole('group', { name: 'Decals / GF9 Stronghold cards' })).toBeNull();
  },
});

/**
 * A pointer token, such as the HMS: a teardrop that rides the table as a plate.
 * Its symbol sits on the round end, its top label runs straight across the neck, and its ring follows the teardrop.
 */
export const PointerToken = meta.story({
  args: { type: 'token-pointer', draft: pointerDraft },
});

/** The pointer's rim chapter: the ring and the three labels, with the copy saying where a teardrop puts them. */
export const PointerTokenRim = meta.story({
  args: { type: 'token-pointer', draft: pointerDraft, chapter: 'front-rim' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('One straight line across the neck, two curved under the symbol.')
    ).toBeVisible();
  },
});
