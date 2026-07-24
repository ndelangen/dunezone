import {
  Box,
  Group,
  Image,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';

import type { Faction } from '@db/factions';
import { TROOP, TROOP_MODIFIER } from '@game/data/generated';

import {
  assetOptionToPreviewSrc,
  troopOptionToLabel,
  troopStarOptionToLabel,
} from './factionFormAssetUtils';
import type { FactionFormApi } from './factionFormTypes';

const troopImageOptions = TROOP.options.map((value) => ({
  value,
  label: troopOptionToLabel(value),
}));

const troopStarOptions = TROOP_MODIFIER.options.map((value) => ({
  value,
  label: troopStarOptionToLabel(value),
}));

function AssetOption({ value, label }: { value: string; label: string }) {
  const preview = assetOptionToPreviewSrc(value);
  return (
    <Group gap="sm" wrap="nowrap">
      {preview ? <Image src={preview} alt="" w={28} h={28} fit="contain" /> : null}
      <Text size="sm" truncate>
        {label}
      </Text>
    </Group>
  );
}

export function TroopSideFields({
  form,
  troopIndex,
  side,
}: {
  form: FactionFormApi;
  troopIndex: number;
  side: 'front' | 'back';
}) {
  const isBack = side === 'back';
  const idBase = isBack ? `troop-${troopIndex}-back` : `troop-${troopIndex}`;
  const i = troopIndex;
  const nameField = isBack ? (`troops[${i}].back.name` as const) : (`troops[${i}].name` as const);
  const imageField = isBack
    ? (`troops[${i}].back.image` as const)
    : (`troops[${i}].image` as const);
  const descField = isBack
    ? (`troops[${i}].back.description` as const)
    : (`troops[${i}].description` as const);
  const starField = isBack ? (`troops[${i}].back.star` as const) : (`troops[${i}].star` as const);
  const stripedField = isBack
    ? (`troops[${i}].back.striped` as const)
    : (`troops[${i}].striped` as const);

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={nameField}>
          {(field) => (
            <TextInput
              id={`${idBase}-name`}
              label={isBack ? 'Back-side name' : 'Troop name'}
              description={
                isBack
                  ? 'Name printed for the reverse side of this physical troop.'
                  : 'Used on the troop token and faction sheet.'
              }
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
            />
          )}
        </form.Field>

        <form.Field name={imageField}>
          {(field) => (
            <Select
              id={`${idBase}-img`}
              label={isBack ? 'Back-side symbol' : 'Troop symbol'}
              description="Select the symbol rendered inside the troop token."
              searchable
              allowDeselect={false}
              data={troopImageOptions}
              value={field.state.value}
              leftSection={
                field.state.value ? (
                  <Image
                    src={assetOptionToPreviewSrc(field.state.value)}
                    alt=""
                    w={22}
                    h={22}
                    fit="contain"
                  />
                ) : null
              }
              renderOption={({ option }) => (
                <AssetOption value={option.value} label={option.label} />
              )}
              comboboxProps={{ withinPortal: false }}
              onChange={(value) => {
                if (value) {
                  field.handleChange(value as Faction['troops'][number]['image']);
                }
              }}
            />
          )}
        </form.Field>
      </SimpleGrid>

      <form.Field name={descField}>
        {(field) => (
          <Textarea
            id={`${idBase}-desc`}
            label={isBack ? 'Back-side description' : 'Troop description'}
            description="Used as the troop rules description on the faction sheet."
            autosize
            minRows={2}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.currentTarget.value)}
          />
        )}
      </form.Field>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={starField}>
          {(field) => (
            <Select
              label={isBack ? 'Back-side star modifier' : 'Star modifier'}
              description="Optional marker rendered on the troop token."
              placeholder="No star modifier"
              clearable
              searchable
              data={troopStarOptions}
              value={field.state.value ?? null}
              renderOption={({ option }) => (
                <AssetOption value={option.value} label={option.label} />
              )}
              comboboxProps={{ withinPortal: false }}
              onChange={(value) =>
                field.handleChange(value ? (value as Faction['troops'][number]['star']) : undefined)
              }
            />
          )}
        </form.Field>

        <Box pt={{ base: 0, sm: 'xl' }}>
          <form.Field name={stripedField}>
            {(field) => (
              <Switch
                id={`${idBase}-striped`}
                label={isBack ? 'Striped reverse token' : 'Striped troop token'}
                description="Adds the striped treatment to this side only."
                checked={field.state.value === true}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(event.currentTarget.checked ? true : undefined)
                }
              />
            )}
          </form.Field>
        </Box>
      </SimpleGrid>
    </Stack>
  );
}
