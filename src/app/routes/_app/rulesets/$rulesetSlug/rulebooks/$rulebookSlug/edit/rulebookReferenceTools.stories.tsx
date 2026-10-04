import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { ReferenceToolsStory } from './rulebookReferenceTools.stories.fixture';

const meta = preview.meta({
  title: 'Reference tools',
  component: ReferenceToolsStory,
  parameters: { layout: 'fullscreen' },
  globals: { colorScheme: 'dark' },
});

export const CircledPageTitle = meta.story({ args: { example: 'heading' } });
export const CardsAndTokens = meta.story({ args: { example: 'component' } });
export const IllustrationSize = meta.story({
  args: { example: 'illustration' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Illustration size' }));
    await userEvent.click(portal.getByRole('option', { name: /^Small$/ }));
    const figure = canvasElement.querySelector('[data-rulebook-block-id="FGRR"]');
    await expect(figure).toHaveAttribute('data-illustration-size', 'small');
  },
});
export const ReferencesFollowPages = meta.story({
  args: { example: 'references' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Shield, page 2' })).toHaveAttribute('href', '#shield');
    await userEvent.click(canvas.getByRole('button', { name: 'Move component page' }));
    await expect(canvas.getByRole('link', { name: 'Shield, page 1' })).toHaveAttribute('href', '#shield');
    await userEvent.click(canvas.getByRole('button', { name: 'Move component page' }));
    await expect(canvas.getByRole('link', { name: 'Shield, page 2' })).toBeVisible();
  },
});
export const BattleReferenceTable = meta.story({ args: { example: 'table' } });
