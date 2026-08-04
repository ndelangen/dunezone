import { Box } from '@mantine/core';
import preview from '@sb/preview';

import type { Faction } from '@db/factions';

import {
  factionEntry,
  incompleteFaction,
  representativeFaction,
} from './FactionAuthoringStoryFixtures';
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

export const IncompleteContent = meta.story({
  args: {
    faction: incompleteFaction(),
  },
});

const missingName = representativeFaction();
missingName.name = '';

export const NameRequired = meta.story({
  args: {
    faction: missingName,
  },
});

export const SaveError = meta.story({
  args: {
    errors: ['The faction could not be saved. Try again without losing this draft.'],
  },
});
