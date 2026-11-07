import { Stack } from '@mantine/core';

import type { FactionFormApi } from './factionFormTypes';
import { LeaderNameField, LeaderPortraitField, LeaderRow, LeaderTokenPreview } from './LeaderFields';

export function FactionFormSectionFactionLeader({
  form,
  showPreview = true,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
}) {
  return (
    <Stack component="section" gap="md" aria-label="Faction leader">
      <LeaderRow
        fields={
          <>
            <form.Field name="factionLeader.name">
              {(field) => (
                <LeaderNameField
                  title="Faction leader name"
                  description="Printed around the faction leader portrait on the Faction shield."
                  inputId="faction-leader-name"
                  blankWarning="The faction leader name is empty. This is advisory and does not prevent saving."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name="factionLeader.image">
              {(field) => (
                <LeaderPortraitField
                  title="Faction leader portrait"
                  inputId="faction-leader-image"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </>
        }
        preview={
          showPreview ? (
            <form.Subscribe
              selector={(state) => ({
                background: state.values.background,
                factionLeader: state.values.factionLeader,
                emblem: state.values.emblem,
              })}
            >
              {({ background, factionLeader, emblem }) => (
                <LeaderTokenPreview
                  caption="Used on: Faction shield"
                  width={148}
                  label="Faction leader token preview"
                  background={background}
                  image={factionLeader.image}
                  emblem={emblem}
                  name={factionLeader.name}
                  strength={undefined}
                />
              )}
            </form.Subscribe>
          ) : null
        }
      />
    </Stack>
  );
}
