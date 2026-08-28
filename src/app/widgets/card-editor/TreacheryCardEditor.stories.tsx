import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { backgroundPresets } from '@game/data/backgrounds';

import { INITIAL_TREACHERY_DRAFT, INITIAL_TREACHERY_MEMORY, TreacheryCardEditor } from './TreacheryCardEditor';
import type { TreacheryDraft } from './TreacheryCardEditor';

const meta = preview.meta({
  title: 'Treachery Card Editor',
  component: TreacheryCardEditor,
  args: {
    nameField: <input aria-label="Name" readOnly value="Lasgun" />,
    draft: { ...INITIAL_TREACHERY_DRAFT, name: 'Lasgun', subName: 'Weapon - Special' },
    patch: fn(),
    memory: INITIAL_TREACHERY_MEMORY,
    remember: fn(),
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

/* The icon still wearing exactly the stripes its head brought, which is the only state where the substitution is on the table at all. */
const wearingItsStripes: TreacheryDraft = {
  ...INITIAL_TREACHERY_DRAFT,
  name: 'Lasgun',
  head: backgroundPresets.weapon,
  icon: [backgroundPresets.stripedWeapon, INITIAL_TREACHERY_DRAFT.icon[1]],
};

/** Picks a head preset other than the one the card is wearing, which is what offers the icon up for substitution. */
async function pickTheDefenseHead(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const row = within(canvas.getByRole('radiogroup', { name: 'Head background' }));
  await userEvent.click(row.getByRole('radio', { name: 'Defense' }));
}

/** Whether the head's pick carried the icon along with it. */
function substituted(patch: unknown): boolean {
  const calls = (patch as { mock: { calls: [Record<string, unknown>][] } }).mock.calls;
  const last = calls.at(-1)?.[0];
  return last !== undefined && 'icon' in last;
}

/**
 * A: intent clear, so the stripes follow the head.
 *
 * The A half of the D5 pair on «Work the editors wave».
 * The icon is still wearing the stripes its head gave it and the author has declared nothing, so there is nothing to lose and the convenience stands.
 */
export const HeadPickCarriesTheStripes = meta.story({
  args: { draft: wearingItsStripes },
  play: async ({ canvasElement, args }) => {
    await pickTheDefenseHead(canvasElement);
    await expect(substituted(args.patch)).toBe(true);
  },
});

/**
 * B: intent set, so the stripes stay where they are.
 *
 * Same draft, same click, one bit different: the author has declared Custom on the icon, which under D5 counts as work to lose even though the value has not diverged yet.
 * Before that ruling this case was invisible, because the test was value equality alone and the value still matched: an author who had opened the icon's composer and not yet typed would have watched the head control replace the background underneath it.
 */
export const HeadPickDefersToDeclaredIconIntent = meta.story({
  args: { draft: wearingItsStripes, memory: { headCustom: false, iconCustom: true } },
  play: async ({ canvasElement, args }) => {
    await pickTheDefenseHead(canvasElement);
    await expect(substituted(args.patch)).toBe(false);
  },
});
