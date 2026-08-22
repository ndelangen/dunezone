import preview from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { backgroundPresets } from '@game/data/backgrounds';

import { INITIAL_TREACHERY_DRAFT, TreacheryCardEditor } from './TreacheryCardEditor';

const meta = preview.meta({
  title: 'Treachery Card Editor',
  component: TreacheryCardEditor,
  args: {
    nameField: <input aria-label="Name" readOnly value="Lasgun" />,
    draft: { ...INITIAL_TREACHERY_DRAFT, name: 'Lasgun', subName: 'Weapon - Special' },
    patch: fn(),
    chapter: 'head' as const,
    onChapterChange: fn(),
    onSettle: fn(),
  },
});

/**
 * The Head chapter, which is where the card's two background rows live.
 *
 * Both rows are the same control, and each has to name itself: the picker once hardcoded
 * `label="Background"`, so a screen reader met two rows it could not tell apart.
 * They announce as
 * "Head background" and "Icon background" now, which is what this story is here to keep true.
 */
export const HeadBackgroundRow = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    /* Named for what it is, not "Background": two identically named rows are two a reader cannot tell apart. */
    await expect(canvas.getByRole('radiogroup', { name: 'Head background' })).toBeVisible();
    await expect(canvas.queryByRole('radiogroup', { name: 'Background' })).toBeNull();
  },
});

/** The Icon chapter, carrying the second of the two rows. */
export const IconBackgroundRow = meta.story({
  args: { chapter: 'icon' as const },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radiogroup', { name: 'Icon background' })).toBeVisible();
    await expect(canvas.queryByRole('radiogroup', { name: 'Background' })).toBeNull();
  },
});

/**
 * A head wearing a preset, with the icon composed away from its matching stripes.
 *
 * Picking a head no longer rewrites the icon in this state: the stripes follow a head only while the icon still wears a head's stripes, so composed work is never discarded without a word.
 */
export const IconComposedAwayFromItsStripes = meta.story({
  args: {
    chapter: 'icon' as const,
    draft: {
      ...INITIAL_TREACHERY_DRAFT,
      name: 'Lasgun',
      head: backgroundPresets.weapon,
      icon: [backgroundPresets.harkonnen, INITIAL_TREACHERY_DRAFT.icon[1]],
    },
  },
});
