import { Box, Input, SimpleGrid, Stack, Switch, Textarea, TextInput } from '@mantine/core';

import type { Faction } from '@db/factions';
import { AssetSelect } from '@app/components/content/FormControls/AssetSelect';
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
          {(field) => {
            const id = `${idBase}-img`;
            const descriptionId = `${id}-description`;
            return (
              <Input.Wrapper
                id={id}
                descriptionProps={{ id: descriptionId }}
                label={isBack ? 'Back-side symbol' : 'Troop symbol'}
                description="Select the symbol rendered inside the troop token."
              >
                <AssetSelect
                  id={id}
                  aria-describedby={descriptionId}
                  allowDeselect={false}
                  data={troopImageOptions}
                  getPreviewSrc={assetOptionToPreviewSrc}
                  value={field.state.value ?? null}
                  onChange={(value) => {
                    if (value) {
                      field.handleChange(value as Faction['troops'][number]['image']);
                    }
                  }}
                />
              </Input.Wrapper>
            );
          }}
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
          {(field) => {
            const id = `${idBase}-star`;
            const descriptionId = `${id}-description`;
            return (
              <Input.Wrapper
                id={id}
                descriptionProps={{ id: descriptionId }}
                label={isBack ? 'Back-side star modifier' : 'Star modifier'}
                description="Optional marker rendered on the troop token."
              >
                <AssetSelect
                  id={id}
                  aria-describedby={descriptionId}
                  placeholder="No star modifier"
                  clearable
                  data={troopStarOptions}
                  getPreviewSrc={assetOptionToPreviewSrc}
                  value={field.state.value ?? null}
                  onChange={(value) =>
                    field.handleChange(
                      value ? (value as Faction['troops'][number]['star']) : undefined
                    )
                  }
                />
              </Input.Wrapper>
            );
          }}
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
