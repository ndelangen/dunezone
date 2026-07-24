import {
  Alert,
  Box,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';

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
    <Stack component="section" gap="md" aria-labelledby="setup-fields-heading">
      <Stack gap={2}>
        <Text id="setup-fields-heading" fw={700} size="lg">
          Setup and revival
        </Text>
        <Text c="dimmed" size="sm">
          Keep free-form instructions separate from the structured Starting spice value.
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Stack gap="md">
          <form.Field name="rules.startText">
            {(field) => {
              const warningId = 'rules-start-warning';
              return (
                <Stack gap={4}>
                  <Textarea
                    id="rules-start"
                    label="Starting instructions"
                    description="Free-form setup instructions shown in the faction rules output. Do not repeat the structured spice amount here unless the prose genuinely needs it."
                    autosize
                    minRows={4}
                    value={field.state.value}
                    aria-describedby={isBlank(field.state.value) ? warningId : undefined}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
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
                <Stack gap={4}>
                  <Textarea
                    id="rules-revival"
                    label="Revival instructions"
                    description="Explains this faction's revival rule in the faction rules output."
                    autosize
                    minRows={3}
                    value={field.state.value}
                    aria-describedby={isBlank(field.state.value) ? warningId : undefined}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                  {isBlank(field.state.value) ? (
                    <Advisory id={warningId}>Revival instructions are empty.</Advisory>
                  ) : null}
                </Stack>
              );
            }}
          </form.Field>
        </Stack>

        <Paper withBorder radius="md" p="md" bg="dune.0">
          <Stack gap="md">
            <Box>
              <Text fw={700}>Structured setup fact</Text>
              <Text c="dimmed" size="sm">
                The faction sheet renders this separately in At start as “Starting spice: N”.
              </Text>
            </Box>
            <form.Field name="rules.spiceCount">
              {(field) => (
                <NumberInput
                  id="rules-spice"
                  label="Starting spice"
                  description="A positive whole-number component count, not prose."
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
              )}
            </form.Field>
            <Alert color="dune" variant="light">
              Starting instructions and Starting spice are intentionally independent fields.
            </Alert>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

function FateFields({ form }: { form: FactionFormApi }) {
  return (
    <Stack component="section" gap="md" aria-labelledby="fate-fields-heading">
      <Stack gap={2}>
        <Text id="fate-fields-heading" fw={700} size="lg">
          Fate
        </Text>
        <Text c="dimmed" size="sm">
          Author the faction&apos;s Fate rule. The heading is optional; the rule text remains
          editable independently.
        </Text>
      </Stack>
      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          <form.Field name="rules.fate.title">
            {(field) => (
              <TextInput
                id="rules-fate-title"
                label="Fate title (optional)"
                description="Leave blank when this Fate rule does not need a separate heading."
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
              />
            )}
          </form.Field>
          <form.Field name="rules.fate.text">
            {(field) => {
              const warningId = 'rules-fate-text-warning';
              return (
                <Stack gap={4}>
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
                  {isBlank(field.state.value) ? (
                    <Advisory id={warningId}>Fate text is empty.</Advisory>
                  ) : null}
                </Stack>
              );
            }}
          </form.Field>
        </Stack>
      </Paper>
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

      {part === 'all' || part === 'fate' ? <FateFields form={form} /> : null}
    </>
  );
}
