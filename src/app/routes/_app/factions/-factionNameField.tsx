import { useCallback, useState } from 'react';

import { FactionNameInput } from '@app/pickers/FactionNameInput';
import { nameConflictComplaint } from '@app/pickers/UniqueNameInput';
import type { NameConflict } from '@app/pickers/UniqueNameInput';
import { factionNameConflictWarning } from '@app/widgets/faction-editor/factionAuthoringContract';
import type { FactionAuthoringWarning } from '@app/widgets/faction-editor/factionAuthoringContract';
import type { FactionIdentityNameField } from '@app/widgets/faction-editor/FactionFormSectionIdentity';

/**
 * The faction editor's name field and the warning it raises, for the two routes that mount the editor.
 *
 * The field is a Picker, so it holds the read the widget may not;
 * the route owns the conflict because the validation header is the route's.
 * Both routes call this rather than wiring it twice, so the create and edit pages cannot drift on the sentence or on where the chip lands.
 */
export function useFactionNameField({ currentSlug }: { currentSlug?: string } = {}): {
  nameField: FactionIdentityNameField;
  conflictWarnings: FactionAuthoringWarning[];
} {
  const [conflict, setConflict] = useState<NameConflict | null>(null);
  const nameField = useCallback<FactionIdentityNameField>(
    ({ value, onChange, onBlur, error }) => (
      <FactionNameInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        currentSlug={currentSlug}
        error={error}
        onConflictChange={setConflict}
      />
    ),
    [currentSlug]
  );
  return {
    nameField,
    conflictWarnings: conflict ? [factionNameConflictWarning(nameConflictComplaint(conflict))] : [],
  };
}
