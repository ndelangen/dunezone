/* Editing a Rulebook's Pages, Blocks and cover, and saving the result (#1590). */
import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { rulebooksMeta, withFinalRulebooks } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Editing',
});

export const CoverPageDetails = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CVER/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Anchor' }, { timeout: 30_000 })).resolves.toHaveValue('cover');
    await expect(page.getByRole('switch', { name: 'Show Dune logo' })).toBeInTheDocument();
    await expect(page.getByRole('textbox', { name: 'Subtitle' })).toHaveValue('Rules for Arrakis');
    await expect(page.getByRole('textbox', { name: 'Supporting text' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Dreamrules');
    await expect(page.getByRole('switch', { name: 'Show page heading' })).toBeChecked();
    await expect(page.queryByRole('link', { name: 'Cover details' })).not.toBeInTheDocument();
    await expect(page.getByRole('link', { name: 'Cover footer' })).toBeVisible();
  },
});

/** The written-rule page's details at rest: its title in the editor and its page in the preview. */
export const WrittenRuleEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Title' }, { timeout: 30_000 })).resolves.toHaveValue(
      'Introduction'
    );
    await expect(page.getByRole('article', { name: 'Rulebook page: Introduction' })).toBeVisible();
  },
});

export const FlipFactionIntroduction = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/FACT' },
  parameters: {
    database: db((baseline) => {
      withFinalRulebooks(baseline);
      const page = baseline.rulebook_drafts[0]!.contents.pagesById.RULE!;
      page.blocksById = {
        FACT: {
          id: 'FACT',
          kind: 'faction-introduction',
          factionId: ref('faction:house-atreides') as unknown as string,
          text: 'The Atreides use knowledge to choose their battles.',
        },
      };
      page.blockOrderByRegion = { content: ['FACT'] };
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const toggle = await page.findByRole('switch', { name: 'Flip layout' }, { timeout: 30_000 });
    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    const block = canvasElement.querySelector('.rulebookFactionIntroduction');
    await waitFor(() => expect(block).toHaveAttribute('data-flipped', 'true'));
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
    await expect(toggle).toBeChecked();
    await expect(block).toHaveAttribute('data-flipped', 'true');
  },
});
