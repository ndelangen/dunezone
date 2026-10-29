import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { initialTokenDraft, TokenProof } from './TokenEditor';
import type { TokenDraft } from './TokenEditor';
import { DISC, discDraftWith, InteractiveEditor } from './TokenEditor.stories.fixture';

const pointerDraft: TokenDraft = { ...initialTokenDraft('token-pointer'), name: 'HMS' };

const meta = preview.meta({
  title: 'Token Editor',
  component: InteractiveEditor,
  parameters: { layout: 'padded' },
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: "Another token's back" })).toBeChecked();
    await expect(canvas.getByText('No token chosen')).toBeVisible();
    await expect(canvas.getByText('Choose a token…')).toBeVisible();
  },
});

/** The pointer's rim chapter is the ring alone: a shape with no label lines offers no label fields. */
export const PointerTokenRim = meta.story({
  args: { type: 'token-pointer', draft: pointerDraft, chapter: 'front-rim' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Edge ring' })).toBeInTheDocument();
    await expect(canvas.queryByRole('textbox', { name: 'Top label' })).toBeNull();
  },
});
