import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from '../tutorial/chapterStory';
import { practiceDatabase } from './practiceDatabase';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Create/Create a faction',
  args: { path: '/create/faction' },
  globals: chapterGlobals,
  /* Under Storybook the story's database serves the practice copy, so it starts from the practice copy's rows. */
  parameters: { ...chapterParameters, database: practiceDatabase },
});

const RAIL = 'Chapter 1: Create a faction';

const retype = async (field: HTMLElement, text: string) => {
  await userEvent.clear(field);
  await userEvent.type(field, text);
};

/** The faction tutorial as a learner meets it: the faction creator, the rail beside it and an arrow to the field to fill in. */
export const Chapter = meta.story({
  play: playChapter(RAIL, 'Name your faction'),
});

/** Every task done in order on the practice copy, through Save to the new faction's own page. */
export const WalkThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const practice = () => within(document.querySelector<HTMLElement>('[data-tutorial-pages]')!);
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    const next = (title: string) => waitForFrame(() => expect(current()).toContain(title), { timeout: 20_000 });
    const tab = (name: string) => userEvent.click(page.getByRole('tab', { name: new RegExp(`^${name}`) }));
    /* Every text task ends with Enter, which leaves the box. */
    const write = async (name: string, text: string) => {
      const box = (await page.findAllByRole('textbox', { name }))[0]!;
      await retype(box, text);
      await userEvent.keyboard('{Enter}');
    };
    /* A picker counts once it closes on the option searched for; opening it and searching is not a pick. */
    const pick = async (selector: string, option: string, stillOpen?: () => unknown) => {
      await userEvent.click(document.querySelector<HTMLElement>(selector)!);
      await userEvent.keyboard(option);
      await stillOpen?.();
      await userEvent.click((await page.findAllByRole('option', { name: option }, { timeout: 20_000 }))[0]!);
    };
    await page.findByRole('banner', { name: RAIL }, { timeout: 60_000 });
    await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 60_000 });
    await write('Faction name', 'Sand Wardens');
    await next('Pick a logo');

    await pick('#faction-logo', 'Ixian', () => expect(current()).toContain('Pick a logo'));
    await next('Pick a background');

    await userEvent.click(document.querySelector<HTMLElement>('[aria-label="Background preset"]')!);
    await userEvent.click(await page.findByRole('option', { name: 'Nexus' }, { timeout: 20_000 }));
    await next('Open Faction leader');

    await tab('Faction leader');
    await next('Name your faction leader');
    await write('Faction leader name', 'Wardeness Ilesa');
    await next('Pick their portrait');
    await pick('#faction-leader-image', 'Jessica');
    await next('Open Leaders');

    await tab('Leaders');
    await next('Add a supporting leader');
    await userEvent.click(await page.findByRole('button', { name: 'Add supporting leader' }));
    await next('Name your new leader');
    await write('Leader name', 'Captain Oruk');
    await next('Set their strength');
    await write('Strength', '5');
    await next('Pick their portrait');
    await pick('#leader-0-img', 'Duncan');
    await next('Open Troops');

    await tab('Troops');
    await next('Name your troops');
    await write('Troop name', 'Wardens');
    await next('Pick their symbol');
    await pick('#troop-0-img', 'Fremen');
    await next('Say how many there are');
    await write('Physical supply', '15');
    await next('Open Alliance');

    await tab('Alliance');
    await next('Write your alliance advantage');
    await write('Alliance advantage', 'Your ally may move one more territory.');
    await next('Open Rules');

    await tab('Rules');
    await next('Say how your troops start');
    await write('Starting instructions', '10 troops in Sietch Tabr.');
    await next('Set your starting spice');
    await write('Starting spice', '12');
    await next('Say how your troops revive');
    await write('Revival instructions', '2 troops revive for free.');
    await next('Write your Karama power');
    await write('Rule text', "Look at one opponent's battle plan.");
    await next('Open Advantages');

    await tab('Advantages');
    await next('Add an advantage');
    await userEvent.click(await page.findByRole('button', { name: 'Add faction advantage' }));
    await next('Give it a title');
    await write('Title (optional)', 'Desert Patrol');
    await next('Write the advantage');
    await write('Advantage rule', 'Your troops move two territories.');
    await next('Look over your faction sheet');

    await userEvent.click(practice().getByRole('button', { name: 'Review faction sheet' }));
    await userEvent.click(await page.findByRole('button', { name: 'Close faction sheet review' }));
    await next('Save your faction');

    await userEvent.click(practice().getByRole('button', { name: 'Save faction' }));
    await next("Visit your faction's page");

    await userEvent.click(await practice().findByRole('button', { name: 'Back' }, { timeout: 30_000 }));
    await page.findByRole('heading', { name: /Chapter complete/ }, { timeout: 30_000 });
    await expect(await page.findByRole('heading', { name: 'Sand Wardens' })).toBeVisible();
  },
});

/** `?step=4` opens at the fourth task; Reset starts a fresh practice copy at the first. */
export const OpenAtStep = meta.story({
  args: { path: '/create/faction?step=4' },
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    await page.findByRole('banner', { name: RAIL }, { timeout: 60_000 });
    await waitForFrame(() => expect(current()).toContain('Open Faction leader'), { timeout: 60_000 });
    await retype(await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 60_000 }), 'Sand Wardens');
    await userEvent.click(page.getByRole('button', { name: /^Reset$/ }));
    const banner = page.getByRole('banner', { name: RAIL });
    await waitForFrame(() => expect(banner.textContent).toContain('1 of 29'), { timeout: 20_000 });
    await expect(await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 60_000 })).toHaveValue('');
  },
});
