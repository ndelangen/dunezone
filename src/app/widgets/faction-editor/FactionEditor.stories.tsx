import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditorFixture, problematicFaction } from './FactionEditor.stories.fixture';

const meta = preview.meta({
  title: 'Faction Editor',
  component: FactionEditorFixture,
  args: {
    faction: representativeFaction(),
    errors: [],
  },
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const RepresentativeFaction = meta.story({});

export const Problems = meta.story({
  args: {
    faction: problematicFaction,
    errors: ['The faction could not be saved. Try again without losing this draft.'],
  },
  play: async ({ args, canvasElement }) => {
    const alert = within(canvasElement).getByRole('alert');
    await expect(alert).toHaveTextContent('Could not save');
    await expect(alert).toHaveTextContent(args.errors[0]!);
  },
});
