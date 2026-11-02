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
    await page.findByRole('banner', { name: RAIL }, { timeout: 60_000 });
    await retype(await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 60_000 }), 'Sand Wardens');
    await userEvent.keyboard('{Enter}');
    await next('Pick a logo');

    await userEvent.click(document.querySelector<HTMLElement>('#faction-logo')!);
    await userEvent.keyboard('Ixian');
    /* Opening the picker and searching is not a pick. */
    await expect(current()).toContain('Pick a logo');
    await userEvent.click(await page.findByRole('option', { name: 'Ixian' }));
    await next('Pick a background');

    await userEvent.click(document.querySelector<HTMLElement>('[aria-label="Background preset"]')!);
    await userEvent.click(await page.findByRole('option', { name: 'Nexus' }, { timeout: 20_000 }));
    await next('Name your faction leader');

    await tab('Faction leader');
    await retype(await page.findByRole('textbox', { name: 'Faction leader name' }), 'Wardeness Ilesa');
    await userEvent.keyboard('{Enter}');
    await next('Add a supporting leader');

    await tab('Leaders');
    await userEvent.click(await page.findByRole('button', { name: 'Add supporting leader' }));
    await next('Name your new leader');

    await retype(await page.findByRole('textbox', { name: 'Leader name' }), 'Captain Oruk');
    await userEvent.keyboard('{Enter}');
    await next('Name your troops');

    await tab('Troops');
    await retype((await page.findAllByRole('textbox', { name: 'Troop name' }))[0]!, 'Wardens');
    await userEvent.keyboard('{Enter}');
    await next('Write your alliance advantage');

    await tab('Alliance');
    await retype(
      await page.findByRole('textbox', { name: 'Alliance advantage' }),
      'Your ally may move one more territory.'
    );
    await userEvent.tab();
    await next('Say how you start');

    await tab('Rules');
    await retype(await page.findByRole('textbox', { name: 'Starting instructions' }), '10 troops in Sietch Tabr.');
    await userEvent.tab();
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
    await waitForFrame(() => expect(current()).toContain('Name your faction leader'), { timeout: 60_000 });
    await retype(await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 60_000 }), 'Sand Wardens');
    await userEvent.click(page.getByRole('button', { name: /^Reset$/ }));
    const banner = page.getByRole('banner', { name: RAIL });
    await waitForFrame(() => expect(banner.textContent).toContain('1 of 12'), { timeout: 20_000 });
    await expect(await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 60_000 })).toHaveValue('');
  },
});
