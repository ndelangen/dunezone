import {
  ColorInput,
  Group,
  Image,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import type { Faction } from '@db/factions';

import { assetOptionToPreviewSrc, logoOptions, logoOptionToLabel } from './factionFormAssetUtils';
import type { FactionFormApi } from './factionFormTypes';
import { TtsColorsEditor } from './TtsColorsEditor';

const logoSelectOptions = logoOptions.map((value) => ({
  value,
  label: logoOptionToLabel(value),
}));

function LogoOption({ value, label }: { value: string; label: string }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Image src={assetOptionToPreviewSrc(value)} alt="" w={30} h={30} fit="contain" />
      <Text size="sm" truncate>
        {label}
      </Text>
    </Group>
  );
}

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

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
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
          {(field) => (
            <Select
              id="faction-logo"
              label="Faction logo"
              description="Used on faction tokens and faction-branded game artifacts."
              searchable
              allowDeselect={false}
              data={logoSelectOptions}
              value={field.state.value}
              leftSection={
                <Image
                  src={assetOptionToPreviewSrc(field.state.value)}
                  alt=""
                  w={24}
                  h={24}
                  fit="contain"
                />
              }
              renderOption={({ option }) => (
                <LogoOption value={option.value} label={option.label} />
              )}
              comboboxProps={{ withinPortal: false }}
              onChange={(value) => {
                if (value) field.handleChange(value as Faction['logo']);
              }}
            />
          )}
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
      </SimpleGrid>

      <form.Field name="colors">
        {(field) => <TtsColorsEditor value={field.state.value} onChange={field.handleChange} />}
      </form.Field>
    </Stack>
  );
}
