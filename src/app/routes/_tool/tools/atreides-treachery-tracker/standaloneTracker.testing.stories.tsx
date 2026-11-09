import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';
import { DREAMRULES_DECK } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { StorySetup } from './standaloneTracker.stories.fixture';

const meta = testingPreview.meta({
  title: 'Tools/Treachery tracker',
  parameters: { database: db(() => {}) },
  globals: { viewport: { value: 'appMobile' } },
});

/** Any faction on Dune Zone can sit at the table: Add a faction searches them all, and a faction can be removed again. */
export const AddAFaction = meta.story({
  render: () => <StorySetup deck={{ status: 'ready', defs: DREAMRULES_DECK }} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Emperor' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add a faction' }));
    await expect(await body.findByRole('button', { name: 'House Atreides is at the table' })).toBeDisabled();
    await userEvent.click(body.getByRole('button', { name: 'Add Ixians' }));
    await expect(canvas.getByText('Ixians')).toBeVisible();
    await expect(canvas.queryByText('Emperor')).toBeNull();
    await expect(canvas.getAllByRole('button', { name: /^Remove / })).toHaveLength(6);
  },
});

/** Removing factions down to one: the tracker needs at least two at the table. */
export const TooFewFactions = meta.story({
  render: () => <StorySetup deck={{ status: 'ready', defs: DREAMRULES_DECK }} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    for (const name of ['House Harkonnen', 'Emperor', 'Spacing Guild', 'Fremen', 'Bene Gesserit']) {
      await userEvent.click(canvas.getByRole('button', { name: `Remove ${name}` }));
    }
    await expect(canvas.getByRole('button', { name: 'Start tracking' })).toHaveAccessibleDescription(
      'Seat at least two factions.'
    );
  },
});
