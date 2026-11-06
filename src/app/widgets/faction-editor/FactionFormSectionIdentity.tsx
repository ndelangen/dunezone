import { Box, ColorInput, Group, Stack, Text, TextInput } from '@mantine/core';
import { HelpMark } from '@ui/content/HelpMark';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ReactNode } from 'react';

import type { Faction } from '@db/factions';

import { assetOptionToPreviewSrc, emblemOptions } from './factionFormAssetUtils';
import styles from './FactionFormSectionIdentity.module.css';
import type { FactionFormApi } from './factionFormTypes';
import { TtsColorsEditor } from './TtsColorsEditor';

const emblemSelectOptions = stockAssetOptions(emblemOptions);

/** The route supplies owner-only renaming; the section binds the control to its form. */
export type FactionIdentityNameField = (props: {
  value: string;
  onChange: (name: string) => void;
  /** The form's blur handler, so the replacement field keeps the plain one's touched tracking. */
  onBlur: () => void;
  error?: string;
}) => ReactNode;

export function FactionFormSectionIdentity({
  form,
  nameError,
  nameField,
  showIntro = true,
}: {
  form: FactionFormApi;
  nameError?: string;
  nameField?: FactionIdentityNameField;
  showIntro?: boolean;
}) {
  return (
    <Stack
      component="section"
      gap="lg"
      aria-label={showIntro ? undefined : 'Faction identity'}
      aria-labelledby={showIntro ? 'faction-identity-heading' : undefined}
    >
      {showIntro ? (
        <Group gap={6} wrap="nowrap">
          <Text id="faction-identity-heading" fw={700} size="lg">
            Faction identity
          </Text>
          <HelpMark text="The name and look reused across all of this faction's artifacts." />
        </Group>
      ) : null}

      <Box className={styles.identityGrid}>
        <form.Field name="name">
          {(field) => (
            <ControlBlock
              title="Faction name"
              description="Shown on faction artifacts. Names may repeat; each faction gets a unique share URL."
              input={
                nameField ? (
                  nameField({
                    value: field.state.value,
                    onChange: (name) => field.handleChange(name),
                    onBlur: field.handleBlur,
                    error: nameError,
                  })
                ) : (
                  <TextInput
                    id="faction-name"
                    aria-label="Faction name"
                    error={nameError}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                )
              }
            />
          )}
        </form.Field>

        <form.Field name="emblem">
          {(field) => (
            <ControlBlock
              title="Faction emblem"
              description="Used on faction tokens and faction-branded game artifacts."
              input={
                <AssetSelect
                  id="faction-emblem"
                  aria-label="Faction emblem"
                  allowDeselect={false}
                  data={emblemSelectOptions}
                  getPreviewSrc={assetOptionToPreviewSrc}
                  glyphPreviews
                  value={field.state.value}
                  onChange={(value) => {
                    if (value) {
                      field.handleChange(value as Faction['emblem']);
                    }
                  }}
                />
              }
            />
          )}
        </form.Field>

        <form.Field name="themeColor">
          {(field) => (
            <ControlBlock
              title="Faction sheet theme"
              description="Used for headings and accents on the complete faction sheet."
              input={
                <ColorInput
                  id="faction-theme-color"
                  aria-label="Faction sheet theme"
                  format="hex"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              }
            />
          )}
        </form.Field>
        <form.Field name="colors">
          {(field) => <TtsColorsEditor value={field.state.value} onChange={field.handleChange} />}
        </form.Field>
      </Box>
    </Stack>
  );
}
