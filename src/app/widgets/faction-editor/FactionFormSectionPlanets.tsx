import { Alert, Divider, Group, Input, SimpleGrid, Stack, TextInput, Textarea } from '@mantine/core';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { useState } from 'react';

import type { Faction } from '@db/factions';
import { useAssetResolver } from '@game/assets/assetRenderMode';
import { CURATED_PLANET_IMAGES } from '@game/data/planetCatalogue';

import { defaultPlanet } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

type PlanetEntry = NonNullable<Faction['planet']>[number];

function PlanetFields({ form, index, onFocus }: { form: FactionFormApi; index: number; onFocus: () => void }) {
  const resolve = useAssetResolver();

  return (
    <form.Field name={`planet[${index}].image`}>
      {(imageField) => {
        const isCurated = CURATED_PLANET_IMAGES.some((option) => option.image === imageField.state.value);
        return (
          <Stack gap="sm">
            {!isCurated ? (
              <Alert color="yellow" variant="light" title="Existing external illustration preserved">
                This planet uses an older external image. It remains unchanged until you select a curated illustration.
              </Alert>
            ) : null}

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <form.Field name={`planet[${index}].name`}>
                {(field) => (
                  <TextInput
                    id={`planet-${index}-name`}
                    label="Name"
                    value={field.state.value}
                    onFocus={onFocus}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      const previous = field.state.value;
                      field.handleChange(next);
                      /* Rename sync: this editor is the only writer of planet names, so
                         troop references follow the rename keystroke for keystroke. */
                      form.state.values.troops.forEach((troop, troopIndex) => {
                        if (troop.planet != null && troop.planet === previous) {
                          form.setFieldValue(`troops[${troopIndex}].planet`, next);
                        }
                      });
                    }}
                  />
                )}
              </form.Field>
              <Input.Wrapper id={`planet-${index}-illustration`} label="Illustration">
                <AssetSelect
                  id={`planet-${index}-illustration`}
                  allowDeselect={false}
                  data={CURATED_PLANET_IMAGES.map((option) => ({ value: option.image, label: option.label }))}
                  getPreviewSrc={(image) => resolve(image as PlanetEntry['image'], 'small')}
                  value={isCurated ? (imageField.state.value ?? null) : null}
                  onFocus={onFocus}
                  onChange={(image) => {
                    if (image) {
                      imageField.handleChange(image as PlanetEntry['image']);
                    }
                  }}
                />
              </Input.Wrapper>
            </SimpleGrid>

            <form.Field name={`planet[${index}].description`}>
              {(field) => (
                <Textarea
                  id={`planet-${index}-description`}
                  label="Description"
                  autosize
                  minRows={2}
                  value={field.state.value}
                  onFocus={onFocus}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                />
              )}
            </form.Field>
          </Stack>
        );
      }}
    </form.Field>
  );
}

export function FactionFormSectionPlanets({
  form,
  selectedIndex,
  onSelectedIndexChange,
}: {
  form: FactionFormApi;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
}) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
  const currentSelectedIndex = selectedIndex ?? internalSelectedIndex;
  const selectIndex = onSelectedIndexChange ?? setInternalSelectedIndex;

  return (
    <Stack component="section" gap="md" aria-label="Faction planets">
      <form.Field name="planet">
        {(field) => {
          const planets = field.state.value ?? [];
          const count = planets.length;
          return (
            <Stack gap="md">
              <Group justify="flex-end">
                <ListLengthActions
                  removeLabel="Remove last planet"
                  addLabel="Add planet"
                  removeDisabled={count === 0}
                  onRemove={() => {
                    const lastIndex = count - 1;
                    if (lastIndex < 0) {
                      return;
                    }
                    if (currentSelectedIndex >= lastIndex) {
                      selectIndex(Math.max(0, lastIndex - 1));
                    }
                    const removedName = planets[lastIndex]?.name;
                    const remaining = planets.slice(0, -1);
                    field.handleChange(remaining);
                    /* Delete sync: references to the removed planet re-pick the first
                       remaining planet; with none left every reference clears, which
                       empties and disables the Forces select. */
                    const fallback = remaining.map((planet) => planet.name).find((name) => name.trim().length > 0);
                    form.state.values.troops.forEach((troop, troopIndex) => {
                      if (troop.planet == null) {
                        return;
                      }
                      if (troop.planet === removedName || remaining.length === 0) {
                        form.setFieldValue(`troops[${troopIndex}].planet`, fallback);
                      }
                    });
                  }}
                  onAdd={() => {
                    field.handleChange([...planets, defaultPlanet()]);
                    selectIndex(count);
                  }}
                />
              </Group>

              {count === 0 ? (
                <Alert color="gray" variant="light" title="No planets">
                  Planets are optional. Add one when a planet is part of this faction&apos;s identity.
                </Alert>
              ) : null}

              {planets.map((_, index) => (
                <Stack key={index} gap="md">
                  {index > 0 ? <Divider /> : null}
                  {/* Focusing any of a planet's fields makes it the preview rail's focused planet. */}
                  <PlanetFields form={form} index={index} onFocus={() => selectIndex(index)} />
                </Stack>
              ))}
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}
