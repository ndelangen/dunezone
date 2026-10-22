import { Text } from '@mantine/core';
import preview from '@sb/preview';
import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import { GF9_LEADER_SKILL_DECK_BACK } from '@shared/assets/gf9LeaderSkills';
import { expect, fn, within } from 'storybook/test';

import type { DeckDraft } from './DeckEditor';
import { DeckEditor, INITIAL_DECK_DRAFT, initialDeckMemory } from './DeckEditor';

function draftWith(cardback: DeckDraft['cardback']): DeckDraft {
  return { ...INITIAL_DECK_DRAFT, name: 'Treachery', cardback };
}

const meta = preview.meta({
  title: 'Deck Editor',
  component: DeckEditor,
  args: {
    presets: INITIAL_CARDBACK_PRESETS.map((entry) => ({ ...entry, revision: 1, href: null, captureStatus: null })),
    nameField: <input aria-label="Name" readOnly value="Lasgun" />,
    chapter: 'back' as const,
    onChapterChange: fn(),
    onSettle: fn(),
    patch: fn(),
    memory: initialDeckMemory(INITIAL_DECK_DRAFT.cardback),
    remember: fn(),
    members: [],
    onCountChange: null,
    cardPicker: null,
    backPicker: <Text size="xs">Choose a deck…</Text>,
    backProof: null,
    draft: INITIAL_DECK_DRAFT,
  },
});

/** A composed back exposes its background and emblem chapters. */
export const CardbackComposedHere = meta.story({
  args: {
    draft: draftWith({ mode: 'custom', ...INITIAL_CARDBACK_PRESETS[1]!.cardback, name: 'Hand of the Emperor' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Composed here' })).toBeChecked();
    await expect(canvas.getByRole('tab', { name: 'Background' })).toBeVisible();
    await expect(canvas.getByRole('tab', { name: 'Emblem' })).toBeVisible();
  },
});

export const TintedCardbackComposedHere = meta.story({
  parameters: { layout: 'fullscreen' },
  args: {
    chapter: 'emblem' as const,
    draft: draftWith({
      mode: 'custom',
      ...GF9_LEADER_SKILL_DECK_BACK,
      emblemBackground: { color: '#4466aa', intensity: 0.35 },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Emblem' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Emblem background shade' })).toHaveValue('#4466aa');
  },
});

/** Worn from another deck: the only tile that is a different union member. */
export const CardbackFromAnotherDeck = meta.story({
  args: { draft: draftWith({ mode: 'reference', asset_id: 'another-deck' }) },
});

export const Identity = meta.story({
  args: { chapter: 'identity' as const, draft: draftWith({ mode: 'custom', ...GF9_LEADER_SKILL_DECK_BACK }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Label' })).toHaveValue('Leader skills');
    await expect(canvas.queryByRole('slider', { name: 'Emblem scale' })).toBeNull();
    await expect(canvas.queryByRole('radiogroup', { name: 'Background' })).toBeNull();
  },
});
export const Background = meta.story({
  args: { chapter: 'background' as const, draft: draftWith({ mode: 'custom', ...GF9_LEADER_SKILL_DECK_BACK }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Background preset' })).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Label' })).toBeNull();
  },
});
export const ResetFromEmblemToPreset = meta.story({
  args: { chapter: 'emblem' as const },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Back' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('radio', { name: 'Shared preset' })).toBeChecked();
    await expect(canvas.queryByRole('tab', { name: 'Emblem' })).toBeNull();
  },
});
