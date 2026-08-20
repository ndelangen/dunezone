import { BackgroundComposer } from '@app/widgets/background-composer/BackgroundComposer';

import type { FactionFormApi } from './factionFormTypes';

/** Binds the shared background composer to the faction form's `background` field. */
export function FactionFormSectionBackground({ form }: { form: FactionFormApi }) {
  return (
    <form.Field name="background">
      {(field) => (
        <BackgroundComposer
          value={field.state.value}
          onChange={field.handleChange}
          usedOn="faction sheet · faction token · leader tokens · troops · alliance card"
        />
      )}
    </form.Field>
  );
}
