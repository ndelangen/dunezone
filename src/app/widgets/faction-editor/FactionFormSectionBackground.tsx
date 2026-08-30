import { BackgroundComposer } from '@app/widgets/background-composer/BackgroundComposer';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import type { FactionFormApi } from './factionFormTypes';

/**
 * Binds the shared background composer to the faction form's `background` field.
 *
 * The composer's colour-mode memory cannot ride the field: it is a fact about the editing session rather than about the faction, and this editor's Reset replaces the form values without remounting anything.
 * It comes from the authoring session instead, which clears it on every path that replaces the draft (#893).
 */
export function FactionFormSectionBackground({
  form,
  modeMemory,
  onModeMemoryChange,
}: {
  form: FactionFormApi;
  modeMemory: BackgroundModeMemory;
  onModeMemoryChange: (memory: BackgroundModeMemory) => void;
}) {
  return (
    <form.Field name="background">
      {(field) => (
        <BackgroundComposer
          value={field.state.value}
          onChange={field.handleChange}
          usedOn="faction sheet · faction token · leader tokens · troops · alliance card"
          modeMemory={modeMemory}
          onModeMemoryChange={onModeMemoryChange}
        />
      )}
    </form.Field>
  );
}
