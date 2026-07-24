import { arrayMove } from '@dnd-kit/sortable';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { defaultAdvantage } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

function AdvantageCard({
  form,
  index,
  onRemove,
}: {
  form: FactionFormApi;
  index: number;
  onRemove: () => void;
}) {
  const advantage = form.state.values.rules.advantages[index];
  if (!advantage) return null;
  const warningId = `adv-${index}-text-warning`;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Box>
            <Text fw={700}>Advantage {index + 1}</Text>
            <Text c="dimmed" size="xs">
              {advantage.title?.trim() || 'Untitled advantage'}
            </Text>
          </Box>
          <Tooltip label={`Remove advantage ${index + 1}`}>
            <ActionIcon
              type="button"
              variant="light"
              color="red"
              aria-label={`Remove advantage ${index + 1}`}
              onClick={onRemove}
            >
              <Trash2 size={16} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </Group>

        <form.Field name={`rules.advantages[${index}].title`}>
          {(field) => (
            <TextInput
              id={`adv-${index}-title`}
              label="Title (optional)"
              description="Leave blank when the rule text is sufficient on its own."
              value={field.state.value ?? ''}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
            />
          )}
        </form.Field>

        <form.Field name={`rules.advantages[${index}].text`}>
          {(field) => {
            const textIsBlank = field.state.value.trim().length === 0;
            return (
              <Stack gap={4}>
                <Textarea
                  id={`adv-${index}-text`}
                  label="Advantage rule"
                  description="The primary rules text for this faction advantage."
                  autosize
                  minRows={3}
                  value={field.state.value}
                  aria-describedby={textIsBlank ? warningId : undefined}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
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
            <Textarea
              id={`adv-${index}-karama`}
              label="Karama interaction (optional)"
              description="Describe the Karama effect only when this advantage has one."
              autosize
              minRows={2}
              value={field.state.value ?? ''}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
            />
          )}
        </form.Field>
      </Stack>
    </Paper>
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
      <Stack gap={2}>
        <Text id="advantages-heading" fw={700} size="lg">
          Faction advantages
        </Text>
        <Text c="dimmed" size="sm">
          Advantages appear in this order in faction rules output. Titles and Karama interactions
          are optional.
        </Text>
      </Stack>

      <form.Field name="rules.advantages" mode="array">
        {(field) => {
          const sortablePrefix = 'advantages-';
          const safeSelectedIndex = Math.min(
            Math.max(currentSelectedIndex, 0),
            Math.max(field.state.value.length - 1, 0)
          );
          return (
            <Stack gap="md">
              {field.state.value.length === 0 ? (
                <Alert color="gray" variant="light" title="No faction advantages">
                  This faction currently has no authored special advantages.
                </Alert>
              ) : null}

              {field.state.value.length > 0 ? (
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
                    onMove={(from, to) =>
                      field.handleChange(arrayMove(field.state.value, from, to))
                    }
                  />
                  <AdvantageCard
                    form={form}
                    index={safeSelectedIndex}
                    onRemove={() => {
                      field.removeValue(safeSelectedIndex);
                      selectIndex(
                        Math.max(0, Math.min(safeSelectedIndex, field.state.value.length - 2))
                      );
                    }}
                  />
                </>
              ) : null}

              <Button
                type="button"
                variant="light"
                color="dune"
                leftSection={<Plus size={16} aria-hidden />}
                onClick={() => {
                  const newIndex = field.state.value.length;
                  field.pushValue(defaultAdvantage());
                  selectIndex(newIndex);
                }}
              >
                Add faction advantage
              </Button>
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}
