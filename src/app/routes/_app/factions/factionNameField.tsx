import { Stack, Text, TextInput } from '@mantine/core';

import type { FactionIdentityNameField } from '@app/widgets/faction-editor/FactionFormSectionIdentity';

/** Faction names may repeat; the save mutation assigns each faction a unique URL. */
export function factionNameField(canRename: boolean): FactionIdentityNameField {
  return ({ value, onChange, onBlur, error }) => (
    <Stack gap={4}>
      <TextInput
        id="faction-name"
        aria-label="Faction name"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={onBlur}
        error={error}
        disabled={!canRename}
      />
      {canRename ? null : (
        <Text size="xs" c="dimmed">
          Only the faction owner can rename it.
        </Text>
      )}
    </Stack>
  );
}
