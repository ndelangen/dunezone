import { Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, fn, screen, userEvent, within } from 'storybook/test';

import { initialTokenDraft, initialTokenMemory, TokenEditor, TokenProof } from './TokenEditor';
import type { TokenDraft } from './TokenEditor';

const TYPE = 'token-disc';

function draftWith(back: TokenDraft['back']): TokenDraft {
  const draft = initialTokenDraft(TYPE);
  return { ...draft, name: 'Spice Blow', front: { ...draft.front, top: 'SPICE', bottomFirst: 'BLOW' }, back };
}

const composedBack = initialTokenDraft(TYPE).back;

const meta = preview.meta({
  title: 'Token Editor',
  component: TokenEditor,
  args: {
    nameField: <input aria-label="Name" readOnly value="Lasgun" />,
    type: TYPE,
    chapter: 'identity' as const,
    onChapterChange: fn(),
    onSettle: fn(),
    patch: fn(),
    memory: initialTokenMemory(composedBack),
    remember: fn(),
    backPicker: () => <Text size="xs">Choose a token…</Text>,
    backProof: <TokenProof face={initialTokenDraft(TYPE).front} type={TYPE} />,
    draft: draftWith(composedBack),
  },
});

/** The back composed here: the Composed tile draws it, and the Back chapters edit it. */
export const BackComposedHere = meta.story({});

/** One artwork printed both sides: the Same tile draws the front, because that is what the mode produces. */
export const BackSameAsFront = meta.story({
  args: { draft: draftWith({ mode: 'same' }) },
});

/** Worn from another token: the picker lives inside the chosen tile rather than beside the row. */
export const BackFromAnotherToken = meta.story({
  args: { draft: draftWith({ mode: 'reference', asset_id: 'another-token' }) },
});

/** Chosen but not yet picked, which is the state the draft holds between the tile and the pick. */
export const BackReferenceNotYetPicked = meta.story({
  args: { draft: draftWith({ mode: 'reference', asset_id: null }), backProof: null },
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

const pointerDraft = initialTokenDraft('token-pointer');

/** A pointer token, such as the HMS: the proof is cut to the teardrop that rides the table as a plate. */
export const PointerToken = meta.story({
  args: {
    type: 'token-pointer',
    draft: { ...pointerDraft, name: 'HMS', front: { ...pointerDraft.front, top: 'HMS' } },
    memory: initialTokenMemory(pointerDraft.back),
    backProof: <TokenProof face={pointerDraft.front} type="token-pointer" />,
  },
});
