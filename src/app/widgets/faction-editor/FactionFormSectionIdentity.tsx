import { Box, ColorInput, Group, Stack, Text, TextInput } from '@mantine/core';
import { HelpMark } from '@ui/content/HelpMark';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';

import type { Faction } from '@db/factions';

import { assetOptionToPreviewSrc, emblemOptions } from './factionFormAssetUtils';
import styles from './FactionFormSectionIdentity.module.css';
import type { FactionFormApi } from './factionFormTypes';
import { TtsColorsEditor } from './TtsColorsEditor';

const emblemSelectOptions = stockAssetOptions(emblemOptions);

export function FactionFormSectionIdentity({
  form,
  nameError,
  showIntro = true,
  disabled = false,
}: {
  form: FactionFormApi;
  nameError?: string;
  showIntro?: boolean;
  /** The viewer may not change these fields, which the Faction shares with every variant. */
  disabled?: boolean;
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
                <TextInput
                  id="faction-name"
                  aria-label="Faction name"
                  error={nameError}
                  disabled={disabled}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                />
              }
            />
          )}
        </form.Field>

        <form.Field name="emblem">
          {(field) => (
            <ControlBlock
              title="Faction emblem"
              description="Used on faction tokens and faction-branded game artifacts."
              inputId="faction-emblem"
              input={(fieldProps) => (
                <AssetSelect
                  {...fieldProps}
                  disabled={disabled}
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
              )}
            />
          )}
        </form.Field>

        <form.Field name="themeColor">
          {(field) => (
            <ControlBlock
              title="Faction sheet theme"
              description="Used for headings and accents on the complete faction sheet."
              inputId="faction-theme-color"
              input={(fieldProps) => (
                <ColorInput
                  {...fieldProps}
                  disabled={disabled}
                  format="hex"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              )}
            />
          )}
        </form.Field>
        <form.Field name="colors">
          {(field) => <TtsColorsEditor value={field.state.value} onChange={field.handleChange} disabled={disabled} />}
        </form.Field>
      </Box>
    </Stack>
  );
}
