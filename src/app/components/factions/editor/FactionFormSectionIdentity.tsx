import { Box, ColorInput, Input, Stack, Text, TextInput } from '@mantine/core';

import type { Faction } from '@db/factions';
import { AssetSelect } from '@app/components/content/FormControls/AssetSelect';

import styles from './FactionFormSectionIdentity.module.css';
import { assetOptionToPreviewSrc, logoOptions, logoOptionToLabel } from './factionFormAssetUtils';
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
        <Stack gap={2}>
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
            <TextInput
              id="faction-name"
              label="Faction name"
              description="Used on faction artifacts and to derive the canonical share URL."
              error={nameError}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
            />
          )}
        </form.Field>

        <form.Field name="logo">
          {(field) => {
            const id = 'faction-logo';
            const descriptionId = `${id}-description`;
            return (
              <Input.Wrapper
                id={id}
                descriptionProps={{ id: descriptionId }}
                label="Faction logo"
                description="Used on faction tokens and faction-branded game artifacts."
              >
                <AssetSelect
                  id={id}
                  aria-describedby={descriptionId}
                  allowDeselect={false}
                  data={logoSelectOptions}
                  getPreviewSrc={assetOptionToPreviewSrc}
                  value={field.state.value}
                  onChange={(value) => {
                    if (value) field.handleChange(value as Faction['logo']);
                  }}
                />
              </Input.Wrapper>
            );
          }}
        </form.Field>

        <form.Field name="themeColor">
          {(field) => (
            <ColorInput
              id="faction-theme-color"
              label="Faction sheet theme"
              description="Used for headings and accents on the complete faction sheet."
              format="hex"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={field.handleChange}
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
