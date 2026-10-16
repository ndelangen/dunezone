import preview from '@sb/preview';
import { expect, fn, screen, userEvent, within } from 'storybook/test';

import type { Faction } from '@db/factions';

import { representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditorHarness } from './FactionEditorHarness.stories.fixture';

function SpecialRuleFixture({ onSave }: { onSave: (draft: Faction) => void }) {
  return <FactionEditorHarness faction={representativeFaction()} sessionKey="special-rule" onSave={onSave} />;
}

const meta = preview.meta({
  title: 'Special rule',
  component: SpecialRuleFixture,
  args: { onSave: fn() },
  parameters: { layout: 'fullscreen' },
});

export const NamingChoice = meta.story({
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const openRules = () => userEvent.click(canvas.getByRole('tab', { name: /^Rules/ }));
    await openRules();
    await expect(canvas.getByRole('radio', { name: 'Faction Special Karama' })).toBeChecked();
    const title = canvas.getByRole('textbox', { name: 'Ability title (optional)' });
    await userEvent.type(title, 'Preserved ability title');

    await userEvent.click(canvas.getByRole('radio', { name: /^Fate$/ }));
    await userEvent.click(canvas.getByRole('tab', { name: /^Advantages/ }));
    await openRules();
    await expect(canvas.getByRole('radio', { name: /^Fate$/ })).toBeChecked();
    await expect(canvas.getByRole('textbox', { name: 'Ability title (optional)' })).toHaveValue(
      'Preserved ability title'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save faction' }));
    await expect(args.onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rules: expect.objectContaining({
          fate: expect.objectContaining({ label: 'fate', title: 'Preserved ability title' }),
        }),
      })
    );

    await userEvent.click(canvas.getByRole('radio', { name: 'Faction Special Karama' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save faction' }));
    await expect(args.onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rules: expect.objectContaining({ fate: { text: 'Special rule text.', title: 'Preserved ability title' } }),
      })
    );
  },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Faction editor sections' }));
    await userEvent.click(screen.getByRole('option', { name: /^Rules/ }));
    await expect(canvas.getByRole('radio', { name: 'Faction Special Karama' })).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: /^Fate$/ }));
    await expect(canvas.getByRole('radio', { name: /^Fate$/ })).toBeChecked();
  },
});
