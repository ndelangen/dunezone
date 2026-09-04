import { arrayMove } from '@dnd-kit/sortable';
import {
  Alert,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { Rotate3d } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { TroopToken } from '@game/assets/faction/troop/Troop';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { createTroopBackFromFront, defaultTroop } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';
import { TroopSideFields } from './TroopSideFields';

function PlanetReferenceSelect({
  id,
  names,
  value,
  onChange,
}: {
  id: string;
  names: string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const matched = value != null && names.includes(value);

  /* The ruled auto-pick (wayfinder #483): an empty or no-longer-matching reference visibly
     adopts the first planet the moment this field renders, deliberately a mount-time draft
     change, not an interaction-gated one; a matching value is never rewritten. */
  useEffect(() => {
    if (names.length > 0 && !matched) {
      onChange(names[0]);
    }
  }, [names, matched, onChange]);

  if (names.length === 0) {
    return (
      <Tooltip label="Add a planet first">
        <Box>
          <Select id={id} aria-label="Planet reference" data={[]} value={null} disabled placeholder="No planets" />
        </Box>
      </Tooltip>
    );
  }

  return (
    <Select
      id={id}
      aria-label="Planet reference"
      allowDeselect={false}
      data={names}
      value={matched ? value : names[0]}
      onChange={(next) => {
        if (next) {
          onChange(next);
        }
      }}
    />
  );
}

function TroopCard({
  form,
  index,
  activeSide,
  onActiveSideChange,
  onToggleBack,
  showPreview,
}: {
  form: FactionFormApi;
  index: number;
  activeSide: 'front' | 'back';
  onActiveSideChange: (side: 'front' | 'back') => void;
  onToggleBack: () => void;
  showPreview: boolean;
}) {
  const troop = form.state.values.troops[index];
  if (!troop) {
    return null;
  }
  const hasBack = troop.back != null;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Group gap="xs">
            <Text fw={700}>Troop {index + 1}</Text>
            {index === 0 ? (
              <Badge variant="light" color="gray">
                Artwork used on the alliance card
              </Badge>
            ) : null}
            {hasBack ? (
              <Badge variant="light" color="selected">
                Two-sided
              </Badge>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed">
            {troop.name.trim() || 'Unnamed troop'}
          </Text>
        </Box>

        <Button
          type="button"
          variant="light"
          color={hasBack ? 'gray' : 'selected'}
          size="compact-sm"
          leftSection={<Rotate3d size={15} aria-hidden />}
          onClick={onToggleBack}
        >
          {hasBack ? 'Remove flip side' : 'Add flip side'}
        </Button>
      </Group>

      {hasBack ? (
        <SegmentedControl
          value={activeSide}
          onChange={(value) => onActiveSideChange(value === 'back' ? 'back' : 'front')}
          data={[
            { value: 'front', label: 'Front side' },
            { value: 'back', label: 'Back side' },
          ]}
          aria-label={`Side to edit for troop ${index + 1}`}
        />
      ) : null}

      <Grid gap="xl" align="start">
        <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
          <Stack gap="md">
            <TroopSideFields
              form={form}
              troopIndex={index}
              side={hasBack && activeSide === 'back' ? 'back' : 'front'}
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <form.Field name={`troops[${index}].count`}>
                {(field) => (
                  <ControlBlock
                    title="Physical supply"
                    description="The sheet lists this once as ×N, including two-sided troops."
                    input={
                      <NumberInput
                        id={`troop-${index}-count`}
                        aria-label="Physical supply"
                        min={1}
                        step={1}
                        allowDecimal={false}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(value) =>
                          field.handleChange(
                            typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1
                          )
                        }
                      />
                    }
                  />
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.planet}>
                {(planets) => {
                  const names = [
                    ...new Set((planets ?? []).map((planet) => planet.name).filter((name) => name.trim().length > 0)),
                  ];
                  return (
                    <form.Field name={`troops[${index}].planet`}>
                      {(field) => (
                        <ControlBlock
                          title="Planet reference"
                          description="Data-only association; it has no current rendered consumer."
                          input={
                            <PlanetReferenceSelect
                              id={`troop-${index}-planet`}
                              names={names}
                              value={field.state.value}
                              onChange={field.handleChange}
                            />
                          }
                        />
                      )}
                    </form.Field>
                  );
                }}
              </form.Subscribe>
            </SimpleGrid>
          </Stack>
        </Grid.Col>

        {showPreview ? (
          <Grid.Col span={4} visibleFrom="sm">
            <form.Subscribe
              selector={(state) => ({
                background: state.values.background,
                troop: state.values.troops[index],
              })}
            >
              {({ background, troop: currentTroop }) =>
                currentTroop ? (
                  <Stack align="center" gap="sm">
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
                      Used on: troop tokens
                    </Text>
                    <Group justify="center" gap="md" wrap="wrap">
                      <Stack align="center" gap="md">
                        <Box w={104} aria-label={`Front token preview for troop ${index + 1}`}>
                          <TroopToken
                            background={background}
                            image={currentTroop.image}
                            star={currentTroop.star}
                            hue={currentTroop.hue}
                            striped={currentTroop.striped}
                          />
                        </Box>
                        <Text size="xs" c="dimmed">
                          Front
                        </Text>
                      </Stack>
                      {currentTroop.back ? (
                        <Stack align="center" gap="md">
                          <Box w={104} aria-label={`Back token preview for troop ${index + 1}`}>
                            <TroopToken
                              background={background}
                              image={currentTroop.back.image}
                              star={currentTroop.back.star}
                              hue={currentTroop.back.hue}
                              striped={currentTroop.back.striped}
                            />
                          </Box>
                          <Text size="xs" c="dimmed">
                            Back
                          </Text>
                        </Stack>
                      ) : null}
                    </Group>
                  </Stack>
                ) : null
              }
            </form.Subscribe>
          </Grid.Col>
        ) : null}
      </Grid>
    </Stack>
  );
}

export function FactionFormSectionTroops({
  form,
  showPreview = true,
  selectedIndex,
  onSelectedIndexChange,
  sideByIndex,
  onSideByIndexChange,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
  /** Lifted alongside selection so the rail can flip each troop token to the side being edited. */
  sideByIndex?: Record<number, 'front' | 'back'>;
  onSideByIndexChange?: Dispatch<SetStateAction<Record<number, 'front' | 'back'>>>;
}) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
  const currentSelectedIndex = selectedIndex ?? internalSelectedIndex;
  const selectIndex = onSelectedIndexChange ?? setInternalSelectedIndex;
  const [internalSideByIndex, setInternalSideByIndex] = useState<Record<number, 'front' | 'back'>>({});
  const troopSideTabByIndex = sideByIndex ?? internalSideByIndex;
  const setTroopSideTabByIndex = onSideByIndexChange ?? setInternalSideByIndex;

  return (
    <Stack component="section" gap="md" aria-label="Troop inventory">
      <form.Field name="troops" mode="array">
        {(field) => {
          const sortablePrefix = 'troops-';
          const count = field.state.value.length;
          const safeSelectedIndex = Math.min(Math.max(currentSelectedIndex, 0), Math.max(count - 1, 0));
          return (
            <Stack gap="md">
              <Group justify="flex-end">
                <ListLengthActions
                  removeLabel="Remove last troop type"
                  addLabel="Add troop type"
                  removeDisabled={count === 0}
                  onRemove={() => {
                    const lastIndex = count - 1;
                    if (lastIndex < 0) {
                      return;
                    }
                    if (currentSelectedIndex >= lastIndex) {
                      selectIndex(Math.max(0, lastIndex - 1));
                    }
                    field.removeValue(lastIndex);
                  }}
                  onAdd={() => {
                    const newIndex = count;
                    field.pushValue(defaultTroop());
                    selectIndex(newIndex);
                  }}
                />
              </Group>

              {count === 0 ? (
                <Alert color="gray" variant="light" title="No troop types">
                  This faction currently has no physical troop inventory.
                </Alert>
              ) : null}

              {count > 0 ? (
                <>
                  <FactionCollectionShelf
                    label="Ordered troop types"
                    sortablePrefix={sortablePrefix}
                    selectedIndex={safeSelectedIndex}
                    onSelectedIndexChange={selectIndex}
                    items={field.state.value.map((troop, index) => ({
                      id: `${sortablePrefix}${index}`,
                      label: troop.name.trim() || 'Unnamed troop',
                      description: `${troop.count} pieces${troop.back ? ' · two-sided' : ''}`,
                    }))}
                    onMove={(from, to) => {
                      field.handleChange(arrayMove(field.state.value, from, to));
                      setTroopSideTabByIndex((previous) => {
                        const tabs = field.state.value.map((_, index) => previous[index] ?? 'front');
                        return Object.fromEntries(arrayMove(tabs, from, to).map((tab, index) => [index, tab]));
                      });
                    }}
                  />
                  <TroopCard
                    form={form}
                    index={safeSelectedIndex}
                    activeSide={troopSideTabByIndex[safeSelectedIndex] ?? 'front'}
                    onActiveSideChange={(side) =>
                      setTroopSideTabByIndex((previous) => ({
                        ...previous,
                        [safeSelectedIndex]: side,
                      }))
                    }
                    onToggleBack={() => {
                      const next = [...field.state.value];
                      const current = next[safeSelectedIndex];
                      if (!current) {
                        return;
                      }
                      next[safeSelectedIndex] = {
                        ...current,
                        back: current.back ? undefined : createTroopBackFromFront(current),
                      };
                      field.handleChange(next);
                      setTroopSideTabByIndex((previous) => ({
                        ...previous,
                        [safeSelectedIndex]: 'front',
                      }));
                    }}
                    showPreview={showPreview}
                  />
                </>
              ) : null}
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}
