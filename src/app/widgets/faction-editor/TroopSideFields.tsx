import { Box, ColorInput, SimpleGrid, Stack, Switch, TextInput, Textarea } from '@mantine/core';
import { TROOP, TROOP_MODIFIER } from '@shared/assetIds';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useEffect } from 'react';

import type { Faction } from '@db/factions';

import { assetOptionToPreviewSrc, troopOptionToLabel, troopStarOptionToLabel } from './factionFormAssetUtils';
import type { FactionFormApi } from './factionFormTypes';

const troopImageOptions = TROOP.options.map((value) => ({
  value,
  label: troopOptionToLabel(value),
}));

/* The -red variants predate the star color field and are redundant with it: the editor
   offers only the base stars, while the schema and renderer keep accepting stored -red
   values so unedited factions render unchanged. */
const troopStarOptions = TROOP_MODIFIER.options
  .filter((value) => !value.includes('-red'))
  .map((value) => ({
    value,
    label: troopStarOptionToLabel(value),
  }));

/* The exact red the renderer paints for a -red star with no hue set (see starHue in Troop.tsx). */
const LEGACY_RED_STAR_HUE = '#ff0000';

type StarValue = Faction['troops'][number]['star'];

/* Normalizes a stored legacy -red star the moment its field renders (the planet auto-pick
   pattern, deliberate and ruled on wayfinder #488): a visible draft change to the modern shape,
   the base star plus the renderer's red in the hue field, never a silent rewrite of anything the
   color field already overrides. Rendering the field is the touch; no interaction is awaited. */
function StarModifierSelect({
  id,
  title,
  value,
  hue,
  onChange,
  onNormalize,
}: {
  id: string;
  title: string;
  value: StarValue;
  hue: string | undefined;
  onChange: (value: StarValue) => void;
  onNormalize: (base: NonNullable<StarValue>, hue: string | undefined) => void;
}) {
  const legacyRed = value != null && value.includes('-red');

  useEffect(() => {
    if (legacyRed && value != null) {
      onNormalize(value.replace('-red', '') as NonNullable<StarValue>, hue ?? LEGACY_RED_STAR_HUE);
    }
  }, [legacyRed, value, hue, onNormalize]);

  return (
    <AssetSelect
      id={id}
      aria-label={title}
      placeholder="No star modifier"
      clearable
      data={troopStarOptions}
      getPreviewSrc={assetOptionToPreviewSrc}
      glyphPreviews
      value={legacyRed ? null : (value ?? null)}
      onChange={(next) => onChange(next ? (next as NonNullable<StarValue>) : undefined)}
    />
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
                input={
                  <AssetSelect
                    id={`${idBase}-img`}
                    aria-label={title}
                    allowDeselect={false}
                    data={troopImageOptions}
                    getPreviewSrc={assetOptionToPreviewSrc}
                    glyphPreviews
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
                input={
                  <StarModifierSelect
                    id={`${idBase}-star`}
                    title={title}
                    value={field.state.value}
                    hue={
                      form.state.values.troops[i]
                        ? isBack
                          ? form.state.values.troops[i].back?.hue
                          : form.state.values.troops[i].hue
                        : undefined
                    }
                    onChange={field.handleChange}
                    onNormalize={(base, hue) => {
                      field.handleChange(base);
                      form.setFieldValue(hueField, hue);
                    }}
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
                description="Optional color for the star modifier; cream when unset."
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
