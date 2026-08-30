import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import type { Faction } from '@db/factions';

import { factionEntry, incompleteFaction, representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditor } from './FactionEditor';
import { useFactionAuthoring } from './useFactionAuthoring';

function FactionEditorFixture({ faction, errors }: { faction: Faction; errors: string[] }) {
  const authoring = useFactionAuthoring({
    sessionKey: 'storybook-faction',
    initialData: faction,
    persistence: {
      save: async (draft) => factionEntry(draft),
      isPending: false,
      error: null,
      hasSaved: false,
      reset: () => undefined,
    },
    onSaved: () => undefined,
  });

  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <FactionEditor
        form={authoring.form}
        errors={errors}
        isNameBlank={authoring.editing.isNameBlank}
        warnings={authoring.editing.warnings}
        backgroundModeMemory={authoring.backgroundModeMemory}
        onBackgroundModeMemoryChange={authoring.setBackgroundModeMemory}
      />
    </Box>
  );
}

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

export const RetainsManualComplexityAcrossChapters = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('tab', { name: /Complexity/ }));
    const manualSwitch = canvas.getByRole('switch', { name: 'Set the rating manually' });
    await userEvent.click(manualSwitch);

    const slider = canvas.getByRole('slider', { name: 'Manual complexity rating' });
    slider.focus();
    await userEvent.keyboard(
      '{Home}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}'
    );
    await expect(slider).toHaveAttribute('aria-valuenow', '7');

    await userEvent.click(manualSwitch);
    await userEvent.click(canvas.getByRole('tab', { name: /Identity/ }));
    await userEvent.click(canvas.getByRole('tab', { name: /Complexity/ }));
    await userEvent.click(canvas.getByRole('switch', { name: 'Set the rating manually' }));

    await expect(canvas.getByRole('slider', { name: 'Manual complexity rating' })).toHaveAttribute(
      'aria-valuenow',
      '7'
    );
  },
});

const problematicFaction = incompleteFaction();
problematicFaction.name = '';

export const Problems = meta.story({
  args: {
    faction: problematicFaction,
    errors: ['The faction could not be saved. Try again without losing this draft.'],
  },
});
