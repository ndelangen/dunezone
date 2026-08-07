import { arrayMove } from '@dnd-kit/sortable';
import {
  ActionIcon,
  Alert,
  AspectRatio,
  Badge,
  Box,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { Check } from 'lucide-react';
import { useState } from 'react';

import type { Faction } from '@db/factions';
import { ControlBlock } from '@app/components/content/FormControls/ControlBlock';
import { ListLengthActions } from '@app/components/content/FormControls/ListLengthActions';
import { useAssetResolver } from '@game/assets/assetRenderMode';
import { CURATED_PLANET_IMAGES } from '@game/data/planetCatalogue';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { defaultPlanet } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

type PlanetEntry = NonNullable<Faction['planet']>[number];

function PlanetImageLibrary({
  value,
  onChange,
  index,
}: {
  value: PlanetEntry['image'] | undefined;
  onChange: (image: PlanetEntry['image']) => void;
  index: number;
}) {
  const resolve = useAssetResolver();
  const isCurated = CURATED_PLANET_IMAGES.some((option) => option.image === value);

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Planet illustration
      </Text>
      <Text size="xs" c="dimmed">
        Choose exactly one of the curated illustrations. This selection is stored now so a future
        planet game asset can use it.
      </Text>

      {!isCurated ? (
        <Alert color="yellow" variant="light" title="Existing external illustration preserved">
          This faction uses an older external image. It will remain unchanged until you select a
          curated illustration below.
        </Alert>
      ) : null}

      <SimpleGrid
        cols={{ base: 3, xs: 4, sm: 5, md: 7 }}
        spacing="xs"
        role="group"
        aria-label={`Curated illustration for planet ${index + 1}`}
      >
        {CURATED_PLANET_IMAGES.map((option, optionIndex) => {
          const selected = option.image === value;
          return (
            <UnstyledButton
              key={option.id}
              type="button"
              aria-label={`Use ${option.label}`}
              aria-pressed={selected}
              onClick={() => onChange(option.image)}
            >
              <Paper
                withBorder
                radius="md"
                p={4}
                style={{
                  backgroundColor: selected
                    ? 'var(--mantine-color-dune-0)'
                    : 'var(--mantine-color-white)',
                  borderColor: selected
                    ? 'var(--mantine-color-dune-7)'
                    : 'var(--mantine-color-gray-3)',
                  boxShadow: selected ? '0 0 0 2px var(--mantine-color-dune-3)' : undefined,
                }}
              >
                <AspectRatio ratio={1}>
                  <Box pos="relative">
                    <Image
                      src={resolve(option.image, 'small')}
                      alt=""
                      fit="contain"
                      w="100%"
                      h="100%"
                    />
                    {selected ? (
                      <ActionIcon
                        component="span"
                        color="dune"
                        variant="filled"
                        size="sm"
                        radius="xl"
                        pos="absolute"
                        top={4}
                        right={4}
                        aria-hidden
                      >
                        <Check size={13} />
                      </ActionIcon>
                    ) : null}
                  </Box>
                </AspectRatio>
                <Text size="xs" ta="center" mt={4} fw={selected ? 700 : 500}>
                  {String(optionIndex + 1).padStart(2, '0')}
                </Text>
              </Paper>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

function PlanetCard({ form, index }: { form: FactionFormApi; index: number }) {
  const planet = form.state.values.planet?.[index];
  if (!planet) {
    return null;
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Box>
          <Text fw={700}>Planet {index + 1}</Text>
          <Text size="xs" c="dimmed">
            {planet.name.trim() || 'Unnamed world'}
          </Text>
        </Box>

        <form.Field name={`planet[${index}].image`}>
          {(field) => (
            <PlanetImageLibrary
              index={index}
              value={field.state.value}
              onChange={(image) => field.handleChange(image)}
            />
          )}
        </form.Field>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <form.Field name={`planet[${index}].name`}>
            {(field) => (
              <ControlBlock
                title="Planet name"
                description="The authored name of this faction world."
                input={
                  <TextInput
                    id={`planet-${index}-name`}
                    aria-label="Planet name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                }
              />
            )}
          </form.Field>
          <form.Field name={`planet[${index}].description`}>
            {(field) => (
              <ControlBlock
                title="Planet description"
                description="Stored with the world for future artifact use."
                input={
                  <Textarea
                    id={`planet-${index}-description`}
                    aria-label="Planet description"
                    autosize
                    minRows={2}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                }
              />
            )}
          </form.Field>
        </SimpleGrid>
      </Stack>
    </Paper>
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
    <Stack component="section" gap="md" aria-labelledby="faction-worlds-heading">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Text id="faction-worlds-heading" fw={700} size="lg">
            Faction worlds
          </Text>
          <Text c="dimmed" size="sm">
            Add zero or more worlds and keep them in the order that best represents the faction.
          </Text>
        </Box>
        <Badge color="yellow" variant="light">
          Game asset: To be implemented later
        </Badge>
      </Group>

      <form.Field name="planet">
        {(field) => {
          const planets = field.state.value ?? [];
          const count = planets.length;
          const sortablePrefix = 'planets-';
          const safeSelectedIndex = Math.min(
            Math.max(currentSelectedIndex, 0),
            Math.max(planets.length - 1, 0)
          );
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
                  Worlds are optional. Add one when a planet is part of this faction&apos;s
                  identity.
                </Alert>
              ) : null}

              {count > 0 ? (
                <>
                  <FactionCollectionShelf
                    label="Ordered faction worlds"
                    sortablePrefix={sortablePrefix}
                    selectedIndex={safeSelectedIndex}
                    onSelectedIndexChange={selectIndex}
                    items={planets.map((planet, index) => ({
                      id: `${sortablePrefix}${index}`,
                      label: planet.name.trim() || 'Unnamed world',
                      description: planet.description.trim() || 'No description',
                    }))}
                    onMove={(from, to) => field.handleChange(arrayMove(planets, from, to))}
                  />
                  <PlanetCard form={form} index={safeSelectedIndex} />
                </>
              ) : null}
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}
