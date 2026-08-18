import { Divider, NumberInput, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';

import type { FactionFormApi } from './factionFormTypes';

function isBlank(value: string | undefined) {
  return value == null || value.trim().length === 0;
}

function Advisory({ children, id }: { children: string; id: string }) {
  return (
    <Text id={id} c="yellow.9" size="xs" role="status">
      {children} This is advisory and does not prevent saving.
    </Text>
  );
}

function SetupFields({ form }: { form: FactionFormApi }) {
  return (
    <Stack component="section" gap="md" aria-label="Setup and revival">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Stack gap="md">
          <form.Field name="rules.startText">
            {(field) => {
              const warningId = 'rules-start-warning';
              return (
                <Stack gap="md">
                  <ControlBlock
                    title="Starting instructions"
                    description="Free-form setup instructions shown in the faction rules output. Do not repeat the structured spice amount here unless the prose genuinely needs it."
                    input={
                      <Textarea
                        id="rules-start"
                        aria-label="Starting instructions"
                        autosize
                        minRows={4}
                        value={field.state.value}
                        aria-describedby={isBlank(field.state.value) ? warningId : undefined}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.currentTarget.value)}
                      />
                    }
                  />
                  {isBlank(field.state.value) ? (
                    <Advisory id={warningId}>Starting instructions are empty.</Advisory>
                  ) : null}
                </Stack>
              );
            }}
          </form.Field>

          <form.Field name="rules.revivalText">
            {(field) => {
              const warningId = 'rules-revival-warning';
              return (
                <Stack gap="md">
                  <ControlBlock
                    title="Revival instructions"
                    input={
                      <Textarea
                        id="rules-revival"
                        aria-label="Revival instructions"
                        autosize
                        minRows={3}
                        value={field.state.value}
                        aria-describedby={isBlank(field.state.value) ? warningId : undefined}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.currentTarget.value)}
                      />
                    }
                  />
                  {isBlank(field.state.value) ? (
                    <Advisory id={warningId}>Revival instructions are empty.</Advisory>
                  ) : null}
                </Stack>
              );
            }}
          </form.Field>
        </Stack>

        <form.Field name="rules.spiceCount">
          {(field) => (
            <ControlBlock
              title="Starting spice"
              description="Rendered in At start as “Starting spice: N”; use a positive whole number."
              input={
                <NumberInput
                  id="rules-spice"
                  aria-label="Starting spice"
                  min={1}
                  step={1}
                  allowDecimal={false}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(value) =>
                    field.handleChange(typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1)
                  }
                />
              }
            />
          )}
        </form.Field>
      </SimpleGrid>
    </Stack>
  );
}

function FateFields({ form }: { form: FactionFormApi }) {
  return (
    <Stack component="section" gap="md" aria-labelledby="fate-fields-heading">
      <Stack gap="xs">
        <Text id="fate-fields-heading" fw={700} size="lg">
          Fate
        </Text>
        <Text c="dimmed" size="sm">
          Author the faction&apos;s Fate rule. The heading is optional; the rule text remains editable independently.
        </Text>
      </Stack>
      <Stack gap="md">
        <form.Field name="rules.fate.title">
          {(field) => (
            <ControlBlock
              title="Fate title (optional)"
              description="Leave blank when this Fate rule does not need a separate heading."
              input={
                <TextInput
                  id="rules-fate-title"
                  aria-label="Fate title (optional)"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
                />
              }
            />
          )}
        </form.Field>
        <form.Field name="rules.fate.text">
          {(field) => {
            const warningId = 'rules-fate-text-warning';
            return (
              <Stack gap="md">
                <Textarea
                  id="rules-fate-text"
                  label="Fate rule"
                  autosize
                  minRows={3}
                  value={field.state.value}
                  aria-describedby={isBlank(field.state.value) ? warningId : undefined}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                />
                {isBlank(field.state.value) ? <Advisory id={warningId}>Fate text is empty.</Advisory> : null}
              </Stack>
            );
          }}
        </form.Field>
      </Stack>
    </Stack>
  );
}

export function FactionFormSectionRules({
  form,
  part = 'all',
}: {
  form: FactionFormApi;
  part?: 'all' | 'setup' | 'fate';
}) {
  return (
    <>
      {part === 'all' || part === 'setup' ? <SetupFields form={form} /> : null}

      {part === 'all' ? <Divider my="lg" /> : null}

      {part === 'all' || part === 'fate' ? <FateFields form={form} /> : null}
    </>
  );
}
