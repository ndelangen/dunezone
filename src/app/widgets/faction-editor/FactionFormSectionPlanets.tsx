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
                This world uses an older external image. It remains unchanged until you select a curated illustration.
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
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
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
    <Stack component="section" gap="md" aria-label="Faction worlds">
      <form.Field name="planet">
        {(field) => {
          const planets = field.state.value ?? [];
          const count = planets.length;
          return (
            <Stack gap="md">
              <Group justify="flex-end">
                <ListLengthActions
                  removeLabel="Remove last faction world"
                  addLabel="Add faction world"
                  removeDisabled={count === 0}
                  onRemove={() => {
                    const lastIndex = count - 1;
                    if (lastIndex < 0) {
                      return;
                    }
                    if (currentSelectedIndex >= lastIndex) {
                      selectIndex(Math.max(0, lastIndex - 1));
                    }
                    field.handleChange(planets.slice(0, -1));
                  }}
                  onAdd={() => {
                    field.handleChange([...planets, defaultPlanet()]);
                    selectIndex(count);
                  }}
                />
              </Group>

              {count === 0 ? (
                <Alert color="gray" variant="light" title="No faction worlds">
                  Worlds are optional. Add one when a planet is part of this faction&apos;s identity.
                </Alert>
              ) : null}

              {planets.map((_, index) => (
                <Stack key={index} gap="md">
                  {index > 0 ? <Divider /> : null}
                  {/* Focusing any of a world's fields makes it the preview rail's focused world. */}
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
