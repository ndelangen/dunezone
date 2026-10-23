import { testingPreview } from '@sb/preview';
import { LEADERS } from '@shared/assetIds';
import { expect, screen, within } from 'storybook/test';

import { LeadersAllianceFixture, withLeadersAndDecals } from './FactionFormSectionLeadersAlliance.stories.fixture';

const meta = testingPreview.meta({
  title: 'Leaders and Alliance',
  component: LeadersAllianceFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const BrowseEveryPortrait = meta.story({
  args: { faction: withLeadersAndDecals(5, 2) },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const portrait = canvas.getByRole('combobox', { name: 'Faction leader portrait' });
    await userEvent.click(portrait);
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(LEADERS.options.length);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('button', { name: 'Filter Faction leader portrait collections' }));
    await userEvent.click(screen.getByRole('option', { name: 'Custom portraits / Green and gold uniforms 9' }));
    await userEvent.click(portrait);
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(9);
    await userEvent.click(screen.getByRole('option', { name: 'Tanya' }));
    await expect(portrait).toHaveValue('Tanya');
    await userEvent.click(canvas.getByRole('button', { name: 'Filter Faction leader portrait collections' }));
    await userEvent.click(screen.getByRole('option', { name: `All collections ${LEADERS.options.length}` }));
    await userEvent.clear(portrait);
    await userEvent.type(portrait, 'Atreides');
    await expect(screen.getByRole('option', { name: 'Jessica' })).toBeVisible();
    await expect(screen.queryByRole('option', { name: 'Tanya' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    const leaderCollection = canvas.getByRole('button', { name: 'Filter Leader portrait collections' });
    await userEvent.click(leaderCollection);
    await userEvent.click(screen.getByRole('option', { name: 'Custom portraits / Green and gold uniforms 9' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByText('2. Supporting leader 2'));
    await expect(leaderCollection).toHaveAttribute('aria-pressed', 'true');
    const supportingPortrait = canvas.getByRole('combobox', { name: 'Leader portrait' });
    await userEvent.click(supportingPortrait);
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(9);
    await userEvent.click(screen.getByRole('option', { name: 'Tirza' }));
    await expect(supportingPortrait).toHaveValue('Tirza');
    await userEvent.click(leaderCollection);
    await userEvent.type(supportingPortrait, 'Atreides');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(7);
    await userEvent.type(supportingPortrait, 'Gurney');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(supportingPortrait).toHaveValue('Gurney');
    await userEvent.click(supportingPortrait);
    await userEvent.type(supportingPortrait, 'no matching portrait');
    await expect(screen.getByText('No matching artwork. Try another search or collection.')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(supportingPortrait).toHaveValue('Gurney');
  },
});
