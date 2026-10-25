import { Box } from '@mantine/core';

import type { Faction } from '@db/factions';

import { factionEntry, incompleteFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditor } from './FactionEditor';
import { useFactionAuthoring } from './useFactionAuthoring';

export function FactionEditorFixture({ faction, errors }: { faction: Faction; errors: string[] }) {
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
        retainedManualComplexity={authoring.retainedManualComplexity}
        onRetainedManualComplexityChange={authoring.setRetainedManualComplexity}
      />
    </Box>
  );
}

export const problematicFaction = incompleteFaction();
problematicFaction.name = '';
