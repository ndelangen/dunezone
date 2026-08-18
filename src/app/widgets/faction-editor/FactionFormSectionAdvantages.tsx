import { arrayMove } from '@dnd-kit/sortable';
import { Alert, Box, Group, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { Surface } from '@ui/surface';
import { useState } from 'react';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { defaultAdvantage } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

function AdvantageCard({ form, index }: { form: FactionFormApi; index: number }) {
  const advantage = form.state.values.rules.advantages[index];
  if (!advantage) {
    return null;
  }
  const warningId = `adv-${index}-text-warning`;

  return (
    <Surface padding="md">
      <Stack gap="md">
        <Box>
          <Text fw={700}>Advantage {index + 1}</Text>
          <Text c="dimmed" size="xs">
            {advantage.title?.trim() || 'Untitled advantage'}
          </Text>
        </Box>

        <form.Field name={`rules.advantages[${index}].title`}>
          {(field) => (
            <ControlBlock
              title="Title (optional)"
              description="Leave blank when the rule text is sufficient on its own."
              input={
                <TextInput
                  id={`adv-${index}-title`}
                  aria-label="Title (optional)"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
                />
              }
            />
          )}
        </form.Field>

        <form.Field name={`rules.advantages[${index}].text`}>
          {(field) => {
            const textIsBlank = field.state.value.trim().length === 0;
            return (
              <Stack gap="md">
                <ControlBlock
                  title="Advantage rule"
                  input={
                    <Textarea
                      id={`adv-${index}-text`}
                      aria-label="Advantage rule"
                      autosize
                      minRows={3}
                      value={field.state.value}
                      aria-describedby={textIsBlank ? warningId : undefined}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                    />
                  }
                />
                {textIsBlank ? (
                  <Text id={warningId} c="yellow.9" size="xs" role="status">
                    Advantage text is empty. This is advisory and does not prevent saving.
                  </Text>
                ) : null}
              </Stack>
            );
          }}
        </form.Field>

        <form.Field name={`rules.advantages[${index}].karama`}>
          {(field) => (
            <ControlBlock
              title="Karama interaction (optional)"
              description="Describe the Karama effect only when this advantage has one."
              input={
                <Textarea
                  id={`adv-${index}-karama`}
                  aria-label="Karama interaction (optional)"
                  autosize
                  minRows={2}
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
                />
              }
            />
          )}
        </form.Field>
      </Stack>
    </Surface>
  );
}

export function FactionFormSectionAdvantages({
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
    <Stack component="section" gap="md" aria-labelledby="advantages-heading">
      <Stack gap="xs">
        <Text id="advantages-heading" fw={700} size="lg">
          Faction advantages
        </Text>
        <Text c="dimmed" size="sm">
          Advantages appear in this order in faction rules output. Titles and Karama interactions are optional.
        </Text>
      </Stack>

      <form.Field name="rules.advantages" mode="array">
        {(field) => {
          const sortablePrefix = 'advantages-';
          const count = field.state.value.length;
          const safeSelectedIndex = Math.min(Math.max(currentSelectedIndex, 0), Math.max(count - 1, 0));
          return (
            <Stack gap="md">
              <Group justify="flex-end">
                <ListLengthActions
                  removeLabel="Remove last faction advantage"
                  addLabel="Add faction advantage"
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
                    field.pushValue(defaultAdvantage());
                    selectIndex(newIndex);
                  }}
                />
              </Group>

              {count === 0 ? (
                <Alert color="gray" variant="light" title="No faction advantages">
                  This faction currently has no authored special advantages.
                </Alert>
              ) : null}

              {count > 0 ? (
                <>
                  <FactionCollectionShelf
                    label="Ordered faction advantages"
                    sortablePrefix={sortablePrefix}
                    selectedIndex={safeSelectedIndex}
                    onSelectedIndexChange={selectIndex}
                    items={field.state.value.map((advantage, index) => ({
                      id: `${sortablePrefix}${index}`,
                      label: advantage.title?.trim() || `Advantage ${index + 1}`,
                      description: advantage.text.trim() || 'No rule text',
                    }))}
                    onMove={(from, to) => field.handleChange(arrayMove(field.state.value, from, to))}
                  />
                  <AdvantageCard form={form} index={safeSelectedIndex} />
                </>
              ) : null}
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}
