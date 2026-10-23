import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import { CreateRulesetStoryPage } from './create.stories.fixture';

const createdRuleset = {
  name: 'Worker Created Ruleset',
  about: 'This ruleset was created by the real page and mutation inside an isolated Storybook database.',
};

const meta = testingPreview.meta({
  title: 'Rulesets/Create',
  component: CreateRulesetStoryPage,
  parameters: {
    layout: 'fullscreen',
    database: db((baseline) => baseline),
  },
});

async function createThroughPage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
  await userEvent.type(name, createdRuleset.name);
  await userEvent.type(page.getByRole('textbox', { name: 'About' }), createdRuleset.about);
  await userEvent.click(page.getByRole('button', { name: 'Create ruleset' }));
  await expect(page.findByRole('heading', { name: createdRuleset.name }, { timeout: 30_000 })).resolves.toBeVisible();
  await expect(page.findByText(createdRuleset.about, {}, { timeout: 30_000 })).resolves.toBeVisible();
  return page;
}

export const Authenticated = meta.story({
  play: async ({ canvasElement }) => {
    const page = await createThroughPage(canvasElement);
    const reset = canvasElement.ownerDocument.querySelector<HTMLButtonElement>('[data-storybook-database-reset]');
    if (!reset) {
      throw new Error('The story database reset control is missing.');
    }
    reset.click();
    await expect(page.findByRole('heading', { name: 'Create ruleset' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/* A complaint reaches the validation header as on every authoring page: the save press creates nothing while it stands, and the chip hands focus to the field. */
export const ShortAbout = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.type(name, 'Test Ruleset');
    const about = page.getByRole('textbox', { name: 'About' });
    await userEvent.type(about, 'Too short.');
    await userEvent.tab();
    const chip = await page.findByRole('button', { name: /About: Ruleset About must be at least 50 characters/ });
    await userEvent.click(page.getByRole('button', { name: 'Create ruleset' }));
    await expect(page.queryByRole('heading', { name: 'Test Ruleset' })).toBeNull();
    await expect(chip).toBeVisible();
    await userEvent.click(chip);
    await expect(about).toHaveFocus();
    await userEvent.type(about, ' It needs a fuller description before it can be created, which this now is.');
    await userEvent.click(page.getByRole('button', { name: 'Create ruleset' }));
    await expect(page.findByRole('heading', { name: 'Test Ruleset' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});
