import { arrayMove } from '@dnd-kit/sortable';
import {
  Alert,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { Rotate3d } from 'lucide-react';
import { useState } from 'react';

import { ControlBlock } from '@app/components/content/FormControls/ControlBlock';
import { ListLengthActions } from '@app/components/content/FormControls/ListLengthActions';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { createTroopBackFromFront, defaultTroop } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';
import { TroopSideFields } from './TroopSideFields';

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
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Box>
            <Group gap="xs">
              <Text fw={700}>Troop {index + 1}</Text>
              {hasBack ? (
                <Badge variant="light" color="dune">
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
            color={hasBack ? 'gray' : 'dune'}
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
                              typeof value === 'number' && Number.isInteger(value) && value > 0
                                ? value
                                : 1
                            )
                          }
                        />
                      }
                    />
                  )}
                </form.Field>

                <form.Field name={`troops[${index}].planet`}>
                  {(field) => (
                    <ControlBlock
                      title="Planet reference (optional)"
                      description="Data-only association; it has no current rendered consumer."
                      input={
                        <TextInput
                          id={`troop-${index}-planet`}
                          aria-label="Planet reference (optional)"
                          placeholder="e.g. Meridian Prime"
                          value={field.state.value ?? ''}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.currentTarget.value || undefined)
                          }
                        />
                      }
                    />
                  )}
                </form.Field>
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
                        <Stack align="center" gap={4}>
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
                          <Stack align="center" gap={4}>
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
    </Paper>
  );
}

export function FactionFormSectionTroops({
  form,
  showPreview = true,
  selectedIndex,
  onSelectedIndexChange,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
}) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
  const currentSelectedIndex = selectedIndex ?? internalSelectedIndex;
  const selectIndex = onSelectedIndexChange ?? setInternalSelectedIndex;
  const [troopSideTabByIndex, setTroopSideTabByIndex] = useState<Record<number, 'front' | 'back'>>(
    {}
  );

  return (
    <Stack component="section" gap="md" aria-label="Troop inventory">
      <form.Field name="troops" mode="array">
        {(field) => {
          const sortablePrefix = 'troops-';
          const count = field.state.value.length;
          const safeSelectedIndex = Math.min(
            Math.max(currentSelectedIndex, 0),
            Math.max(count - 1, 0)
          );
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
                        const tabs = field.state.value.map(
                          (_, index) => previous[index] ?? 'front'
                        );
                        return Object.fromEntries(
                          arrayMove(tabs, from, to).map((tab, index) => [index, tab])
                        );
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
