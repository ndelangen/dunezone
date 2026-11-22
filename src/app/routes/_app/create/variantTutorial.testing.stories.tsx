import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from '../tutorial/chapterStory';
import { practiceDatabase } from './practiceDatabase';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Create/Make your own variant',
  args: { path: '/create/variant' },
  globals: chapterGlobals,
  /* Under Storybook the story's database serves the practice copy, so it starts from the practice copy's rows. */
  parameters: { ...chapterParameters, database: practiceDatabase },
});

const RAIL = 'Chapter 2: Make your own variant';
const LOAD = { timeout: 30_000 };

/** The variant tutorial as a learner meets it: the faction catalogue, the rail beside it and an arrow to House Atreides. */
export const Chapter = meta.story({
  play: playChapter(RAIL, 'Open a faction'),
});

/** Every task done in order on the practice copy: a faction opened, another variant read, and a variant made with one field its own. */
export const WalkThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const practice = () => within(document.querySelector<HTMLElement>('[data-tutorial-pages]')!);
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    const next = (title: string) => waitForFrame(() => expect(current()).toContain(title), { timeout: 20_000 });
    const variants = async () => within(await practice().findByRole('region', { name: 'Variants' }, LOAD));
    const names = async () =>
      (await variants()).getAllByRole('listitem').map((row) => within(row).getByRole('paragraph').textContent);

    await page.findByRole('banner', { name: RAIL }, { timeout: 60_000 });
    await next('Open a faction');
    /* One card for the faction, however many variants it has; it comes after the band's newest arrival. */
    const cards = await practice().findAllByRole('link', { name: /House Atreides/ }, LOAD);
    await userEvent.click(cards.at(-1)!);
    await next('Switch variant');

    await expect(await names()).toEqual(['Original', 'Tournament', 'Two players', 'Beginner']);
    /* Choosing the variant already open is no switch: the default has an address of its own beside the faction's. */
    await userEvent.click((await variants()).getByRole('link', { name: /Original/ }));
    await waitForFrame(async () =>
      expect((await variants()).getByRole('link', { name: /Original/ })).toHaveAttribute('aria-current', 'page')
    );
    await expect(current()).toContain('Switch variant');
    await userEvent.click((await variants()).getByRole('link', { name: /Tournament/ }));
    await next('Press Create variant');

    await userEvent.click(await practice().findByRole('button', { name: 'Create variant' }, LOAD));
    await next('Name your variant');
    const form = within(await page.findByRole('form', { name: 'Create variant' }, LOAD));
    /* The form offers the variant on the page as the parent, which is the one the learner switched to. */
    await expect(form.getByRole('radio', { name: 'Tournament' })).toBeChecked();
    const name = form.getByRole('textbox', { name: 'Variant name' });
    await userEvent.type(name, 'Homebrew');
    /* The name counts once the learner leaves the box; the pause is covered by variantTutorialTasks.test.ts. */
    await userEvent.tab();
    await next('Pick a parent and create it');
    await userEvent.click(form.getByRole('button', { name: 'Create variant' }));
    await next('Open the editor');
    await expect(await names()).toEqual(['Original', 'Tournament', 'Two players', 'Beginner', 'Homebrew']);

    await userEvent.click(await practice().findByRole('link', { name: 'Edit faction' }, LOAD));
    await next('Make one field your own');
    await userEvent.click(await page.findByRole('tab', { name: /^Rules/ }, LOAD));
    const choice = await page.findByRole('checkbox', { name: 'Use parent variant for Revival instructions' }, LOAD);
    await expect(choice).toBeChecked();
    await expect(current()).toContain('Make one field your own');
    await userEvent.click(choice);
    await next('Change it');

    const revival = (await page.findAllByRole('textbox', { name: 'Revival instructions' }))[0]!;
    await userEvent.type(revival, ' 3 when you hold Arrakeen.');
    revival.blur();
    await page.findByRole('heading', { name: /Chapter complete/ }, { timeout: 30_000 });
    /* The other fields still follow the parent. */
    await expect(page.getByRole('checkbox', { name: 'Use parent variant for Starting spice' })).toBeChecked();
  },
});

/** Reset starts a fresh practice copy on the catalogue, without the variant the learner made. */
export const Reset = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const practice = () => within(document.querySelector<HTMLElement>('[data-tutorial-pages]')!);
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    const next = (title: string) => waitForFrame(() => expect(current()).toContain(title), { timeout: 20_000 });
    const banner = await page.findByRole('banner', { name: RAIL }, { timeout: 60_000 });
    await next('Open a faction');
    await userEvent.click((await practice().findAllByRole('link', { name: /House Atreides/ }, LOAD)).at(-1)!);
    await next('Switch variant');
    await userEvent.click(page.getByRole('button', { name: /^Reset$/ }));
    await waitForFrame(() => expect(banner.textContent).toContain('1 of 8'), { timeout: 20_000 });
    await expect(await practice().findAllByRole('link', { name: /House Atreides/ }, LOAD)).not.toHaveLength(0);
    await expect(practice().queryByRole('region', { name: 'Variants' })).toBeNull();
  },
});
