import { Box, ColorInput, Stack, Text, TextInput } from '@mantine/core';
import { AssetSelect } from '@ui/input/AssetSelect';
import { ControlBlock } from '@ui/input/ControlBlock';

import type { Faction } from '@db/factions';

import { assetOptionToPreviewSrc, logoOptions, logoOptionToLabel } from './factionFormAssetUtils';
import styles from './FactionFormSectionIdentity.module.css';
import type { FactionFormApi } from './factionFormTypes';
import { TtsColorsEditor } from './TtsColorsEditor';

const logoSelectOptions = logoOptions.map((value) => ({
  value,
  label: logoOptionToLabel(value),
}));

export function FactionFormSectionIdentity({
  form,
  nameError,
  showIntro = true,
}: {
  form: FactionFormApi;
  nameError?: string;
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
        <Stack gap="xs">
          <Text id="faction-identity-heading" fw={700} size="lg">
            Faction identity
          </Text>
          <Text c="dimmed" size="sm">
            These values name the faction and establish the identity reused across its artifacts.
          </Text>
        </Stack>
      ) : null}

      <Box className={styles.identityGrid}>
        <form.Field name="name">
          {(field) => (
            <ControlBlock
              title="Faction name"
              description="Used on faction artifacts and to derive the canonical share URL."
              input={
                <TextInput
                  id="faction-name"
                  aria-label="Faction name"
                  error={nameError}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                />
              }
            />
          )}
        </form.Field>

        <form.Field name="logo">
          {(field) => (
            <ControlBlock
              title="Faction logo"
              description="Used on faction tokens and faction-branded game artifacts."
              input={
                <AssetSelect
                  id="faction-logo"
                  aria-label="Faction logo"
                  allowDeselect={false}
                  data={logoSelectOptions}
                  getPreviewSrc={assetOptionToPreviewSrc}
                  value={field.state.value}
                  onChange={(value) => {
                    if (value) {
                      field.handleChange(value as Faction['logo']);
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
