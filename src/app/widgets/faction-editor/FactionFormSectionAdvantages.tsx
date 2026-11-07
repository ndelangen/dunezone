import { arrayMove } from '@dnd-kit/sortable';
import { Box, Stack, Text, TextInput } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';

import { defaultAdvantage } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';
import { FactionListSection, useListSelection } from './FactionListSection';

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
  const [selected, select] = useListSelection(selectedIndex, onSelectedIndexChange);
  return (
    <form.Field name="rules.advantages" mode="array">
      {(field) => (
        <FactionListSection
          title="Faction advantages"
          help={'Advantages appear in this order in the faction rules.\nTitles and Karama interactions are optional.'}
          note={
            field.state.value.length === 0
              ? { title: 'No faction advantages', text: 'This faction currently has no authored special advantages.' }
              : null
          }
          noun="faction advantage"
          sortablePrefix="advantages-"
          values={field.state.value}
          describe={(advantage, index) => ({
            label: advantage.title?.trim() || `Advantage ${index + 1}`,
            description: advantage.text.trim() || 'No rule text',
          })}
          selected={selected}
          onSelect={select}
          onAdd={() => field.pushValue(defaultAdvantage())}
          onRemoveLast={() => field.removeValue(field.state.value.length - 1)}
          onMove={(from, to) => field.handleChange(arrayMove(field.state.value, from, to))}
        >
          {(index) => <AdvantageCard form={form} index={index} />}
        </FactionListSection>
      )}
    </form.Field>
  );
}
