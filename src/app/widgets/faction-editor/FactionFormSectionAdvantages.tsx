import { arrayMove } from '@dnd-kit/sortable';
import { Box, Stack, Text, TextInput } from '@mantine/core';
import { ListChapter } from '@ui/block/ListChapter';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { useState } from 'react';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { defaultAdvantage } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

function AdvantageCard({ form, index }: { form: FactionFormApi; index: number }) {
  const advantage = form.state.values.rules.advantages[index];
  if (!advantage) {
    return null;
  }

  return (
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
            inputId={`adv-${index}-title`}
            input={(fieldProps) => (
              <TextInput
                {...fieldProps}
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
              />
            )}
          />
        )}
      </form.Field>

      <form.Field name={`rules.advantages[${index}].text`}>
        {(field) => {
          const textIsBlank = field.state.value.trim().length === 0;
          return (
            <ControlBlock
              title="Advantage rule"
              inputId={`adv-${index}-text`}
              warning={
                textIsBlank ? 'Advantage text is empty. This is advisory and does not prevent saving.' : undefined
              }
              input={(control) => (
                <FormattedTextInput
                  {...control}
                  minRows={3}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              )}
            />
          );
        }}
      </form.Field>

      <form.Field name={`rules.advantages[${index}].karama`}>
        {(field) => (
          <ControlBlock
            title="Karama interaction (optional)"
            description="Describe the Karama effect only when this advantage has one."
            inputId={`adv-${index}-karama`}
            input={(fieldProps) => (
              <FormattedTextInput
                {...fieldProps}
                minRows={2}
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                onChange={(value) => field.handleChange(value || undefined)}
              />
            )}
          />
        )}
      </form.Field>
    </Stack>
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
    <form.Field name="rules.advantages" mode="array">
      {(field) => {
        const sortablePrefix = 'advantages-';
        const count = field.state.value.length;
        const safeSelectedIndex = Math.min(Math.max(currentSelectedIndex, 0), Math.max(count - 1, 0));
        return (
          <ListChapter
            title="Faction advantages"
            help={'Advantages appear in this order in the faction rules.\nTitles and Karama interactions are optional.'}
            note={
              count === 0
                ? { title: 'No faction advantages', text: 'This faction currently has no authored special advantages.' }
                : null
            }
            actions={
              <>
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
              </>
            }
          >
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
          </ListChapter>
        );
      }}
    </form.Field>
  );
}
