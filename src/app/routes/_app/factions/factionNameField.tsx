import { TextInput } from '@mantine/core';

import type { FactionIdentityNameField } from '@app/widgets/faction-editor/FactionFormSectionIdentity';

/** Faction names may repeat; the save mutation assigns each faction a unique URL. */
export function factionNameField(canRename: boolean): FactionIdentityNameField {
  return ({ value, onChange, onBlur, error }) => (
    <TextInput
      id="faction-name"
      aria-label="Faction name"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onBlur={onBlur}
      error={error}
      disabled={!canRename}
      description={canRename ? undefined : 'Only the faction owner can rename it.'}
    />
  );
}
