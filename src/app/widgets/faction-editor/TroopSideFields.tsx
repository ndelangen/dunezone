import { Box, ColorInput, SimpleGrid, Stack, Switch, TextInput, Textarea } from '@mantine/core';
import { TROOP, TROOP_MODIFIER } from '@shared/assetIds';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';

import type { Faction } from '@db/factions';

import { assetOptionToPreviewSrc, troopOptionToLabel, troopStarOptionToLabel } from './factionFormAssetUtils';
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
  const imageField = isBack ? (`troops[${i}].back.image` as const) : (`troops[${i}].image` as const);
  const descField = isBack ? (`troops[${i}].back.description` as const) : (`troops[${i}].description` as const);
  const starField = isBack ? (`troops[${i}].back.star` as const) : (`troops[${i}].star` as const);
  const hueField = isBack ? (`troops[${i}].back.hue` as const) : (`troops[${i}].hue` as const);
  const stripedField = isBack ? (`troops[${i}].back.striped` as const) : (`troops[${i}].striped` as const);

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={nameField}>
          {(field) => {
            const title = isBack ? 'Back-side name' : 'Troop name';
            return (
              <ControlBlock
                title={title}
                description={
                  isBack
                    ? 'Name printed for the reverse side of this physical troop.'
                    : 'Used on the troop token and faction sheet.'
                }
                input={
                  <TextInput
                    id={`${idBase}-name`}
                    aria-label={title}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                }
              />
            );
          }}
        </form.Field>

        <form.Field name={imageField}>
          {(field) => {
            const title = isBack ? 'Back-side symbol' : 'Troop symbol';
            return (
              <ControlBlock
                title={title}
                description="Select the symbol rendered inside the troop token."
                input={
                  <AssetSelect
                    id={`${idBase}-img`}
                    aria-label={title}
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
                }
              />
            );
          }}
        </form.Field>
      </SimpleGrid>

      <form.Field name={descField}>
        {(field) => {
          const title = isBack ? 'Back-side description' : 'Troop description';
          return (
            <ControlBlock
              title={title}
              description="Used as the troop rules description on the faction sheet."
              input={
                <Textarea
                  id={`${idBase}-desc`}
                  aria-label={title}
                  autosize
                  minRows={2}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                />
              }
            />
          );
        }}
      </form.Field>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={starField}>
          {(field) => {
            const title = isBack ? 'Back-side star modifier' : 'Star modifier';
            return (
              <ControlBlock
                title={title}
                description="Optional marker rendered on the troop token."
                input={
                  <AssetSelect
                    id={`${idBase}-star`}
                    aria-label={title}
                    placeholder="No star modifier"
                    clearable
                    data={troopStarOptions}
                    getPreviewSrc={assetOptionToPreviewSrc}
                    value={field.state.value ?? null}
                    onChange={(value) =>
                      field.handleChange(value ? (value as Faction['troops'][number]['star']) : undefined)
                    }
                  />
                }
              />
            );
          }}
        </form.Field>

        <form.Field name={hueField}>
          {(field) => {
            const title = isBack ? 'Back-side star color' : 'Star color';
            return (
              <ControlBlock
                title={title}
                description="Optional color for the star modifier; cream (red for -red stars) when unset."
                input={
                  <ColorInput
                    id={`${idBase}-hue`}
                    aria-label={title}
                    placeholder="Default"
                    value={field.state.value ?? ''}
                    onBlur={field.handleBlur}
                    onChangeEnd={(value) => field.handleChange(value ? value : undefined)}
                  />
                }
              />
            );
          }}
        </form.Field>

        <Box pt={{ base: 0, sm: 'xl' }}>
          <form.Field name={stripedField}>
            {(field) => {
              const title = isBack ? 'Striped reverse token' : 'Striped troop token';
              return (
                <ControlBlock
                  title={title}
                  description="Adds the striped treatment to this side only."
                  input={
                    <Switch
                      id={`${idBase}-striped`}
                      aria-label={title}
                      checked={field.state.value === true}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.checked ? true : undefined)}
                    />
                  }
                />
              );
            }}
          </form.Field>
        </Box>
      </SimpleGrid>
    </Stack>
  );
}
