import { useState } from 'react';
import type { ReactNode } from 'react';

import { FactionNameInput } from '@app/pickers/FactionNameInput';
import { nameConflictComplaint } from '@app/pickers/UniqueNameInput';
import type { NameConflict } from '@app/pickers/UniqueNameInput';
import type { FactionAuthoringWarning } from '@app/widgets/faction-editor/factionAuthoringContract';
import { FACTION_NAME_BLANK_MESSAGE } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionFormApi } from '@app/widgets/faction-editor/factionFormTypes';

/**
 * The save guard's rule, live while the author types: a colliding faction name warns here instead of dying as a save error.
 * One call per faction editor route.
 * The returned field slots into the editor and the warnings join the validation header.
 */
export function useFactionNameField({
  form,
  isNameBlank,
  currentSlug,
}: {
  form: FactionFormApi;
  isNameBlank: boolean;
  /** The faction's own slug on the edit page, so an unchanged name never warns about its own address. */
  currentSlug?: string;
}): { nameField: ReactNode; conflictWarnings: FactionAuthoringWarning[] } {
  const [conflict, setConflict] = useState<NameConflict | null>(null);
  const nameField = (
    <form.Field name="name">
      {(field) => (
        <FactionNameInput
          id="faction-name"
          value={field.state.value}
          onChange={field.handleChange}
          onBlur={field.handleBlur}
          currentSlug={currentSlug}
          onConflictChange={setConflict}
          error={isNameBlank ? FACTION_NAME_BLANK_MESSAGE : undefined}
        />
      )}
    </form.Field>
  );
  const conflictWarnings: FactionAuthoringWarning[] = conflict
    ? [
        {
          path: 'name',
          chapter: 'identity',
          label: `Identity: ${nameConflictComplaint(conflict)}`,
          targetId: 'faction-name',
          source: 'Identity',
          complaint: nameConflictComplaint(conflict),
        },
      ]
    : [];
  return { nameField, conflictWarnings };
}
