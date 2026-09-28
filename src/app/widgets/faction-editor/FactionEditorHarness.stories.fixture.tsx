import { Box, Stack } from '@mantine/core';

import type { Faction } from '@db/factions';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';

import { factionEntry } from './FactionAuthoringStoryFixtures';
import { FactionEditor } from './FactionEditor';
import { useFactionAuthoring } from './useFactionAuthoring';

/* The editor with its toolbar above, so a chapter's story shows Save held or free; `onSave` sees each draft that saves. */
export function FactionEditorHarness({
  faction,
  sessionKey,
  onSave,
}: {
  faction: Faction;
  sessionKey: string;
  onSave?: (draft: Faction) => void;
}) {
  const authoring = useFactionAuthoring({
    sessionKey,
    initialData: faction,
    persistence: {
      save: async (draft) => {
        onSave?.(draft);
        return factionEntry(draft);
      },
      isPending: false,
      error: null,
      hasSaved: false,
      reset: () => undefined,
    },
    onSaved: () => undefined,
  });

  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <Stack gap="md">
        <AuthoringToolbar
          status={{
            isDirty: authoring.editing.isDirty,
            isNameBlank: authoring.editing.isNameBlank,
            invalid: authoring.editing.invalid,
            saveState: authoring.persistence.saveState,
          }}
          copy={{
            saveLabel: 'Save faction',
            nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
          }}
          actions={{ onSave: authoring.actions.submit, onReset: authoring.actions.reset, onBack: () => undefined }}
        />
        <FactionEditor
          form={authoring.form}
          errors={authoring.persistence.errors}
          isNameBlank={authoring.editing.isNameBlank}
          warnings={authoring.editing.warnings}
          backgroundModeMemory={authoring.backgroundModeMemory}
          onBackgroundModeMemoryChange={authoring.setBackgroundModeMemory}
          retainedManualComplexity={authoring.retainedManualComplexity}
          onRetainedManualComplexityChange={authoring.setRetainedManualComplexity}
        />
      </Stack>
    </Box>
  );
}
