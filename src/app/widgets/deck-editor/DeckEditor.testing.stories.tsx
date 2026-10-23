import { Text } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import { expect, fn, within } from 'storybook/test';

import { DeckEditor, INITIAL_DECK_DRAFT, initialDeckMemory } from './DeckEditor';
import { draftWith } from './DeckEditor.stories.fixture';

const meta = testingPreview.meta({
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
export const ResetFromEmblemToPreset = meta.story({
  args: { chapter: 'emblem' as const },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Back' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('radio', { name: 'Shared preset' })).toBeChecked();
    await expect(canvas.queryByRole('tab', { name: 'Emblem' })).toBeNull();
  },
});
