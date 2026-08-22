import { Text } from '@mantine/core';
import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { initialTokenDraft, TokenEditor, TokenProof } from './TokenEditor';
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
    backPicker: () => <Text size="xs">Choose a token…</Text>,
    backProof: <TokenProof face={initialTokenDraft(TYPE).front} type={TYPE} width={900} />,
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
