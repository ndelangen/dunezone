import { Divider, Group, NumberInput, Radio, SimpleGrid, Stack, Switch, TextInput } from '@mantine/core';
import { factionSpecialRuleLabel, factionSpecialRuleLabels } from '@shared/factions/specialRule';
import { Section } from '@ui/block/Section';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';

import type { FactionFormApi } from './factionFormTypes';

function isBlank(value: string | undefined) {
  return value == null || value.trim().length === 0;
}

/** An empty rule is allowed, so the field says so rather than blocking the save. */
function advisory(blank: boolean, text: string) {
  return blank ? `${text} This is advisory and does not prevent saving.` : undefined;
}

function SetupFields({ form }: { form: FactionFormApi }) {
  return (
    <Stack component="section" gap="md" aria-label="Setup and revival">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Stack gap="md">
          <form.Field name="rules.startText">
            {(field) => {
              return (
                <ControlBlock
                  title="Starting instructions"
                  inputId="rules-start"
                  warning={advisory(isBlank(field.state.value), 'Starting instructions are empty.')}
                  description={
                    'Setup instructions shown in the faction rules.\nLeave out the spice amount; it is printed already.'
                  }
                  input={(control) => (
                    <FormattedTextInput
                      {...control}
                      minRows={4}
                      profile="marks-only"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={field.handleChange}
                    />
                  )}
                />
              );
            }}
          </form.Field>

          <form.Field name="rules.revivalText">
            {(field) => {
              return (
                <ControlBlock
                  title="Revival instructions"
                  inputId="rules-revival"
                  warning={advisory(isBlank(field.state.value), 'Revival instructions are empty.')}
                  input={(control) => (
                    <FormattedTextInput
                      {...control}
                      minRows={3}
                      profile="marks-only"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={field.handleChange}
                    />
                  )}
                />
              );
            }}
          </form.Field>
        </Stack>

        <Stack gap="md">
          <form.Field name="rules.spiceCount">
            {(field) => (
              <ControlBlock
                title="Starting spice"
                description="Rendered in At start as “Starting spice: N”; use a positive whole number."
                inputId="rules-spice"
                input={(fieldProps) => (
                  <NumberInput
                    {...fieldProps}
                    min={1}
                    step={1}
                    allowDecimal={false}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(value) =>
                      field.handleChange(typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1)
                    }
                  />
                )}
              />
            )}
          </form.Field>

          <form.Field name="rules.treacheryTracker">
            {(field) => (
              <ControlBlock
                title="Treachery tracker"
                description={
                  'In Play, this faction can open a private tracker of every Treachery card: who won it, and what is left in the deck.\nTurn it on for a faction that sees cards before they are bid on, as Atreides does.'
                }
                inputId="rules-treachery-tracker"
                input={(fieldProps) => (
                  <Switch
                    {...fieldProps}
                    checked={field.state.value ?? false}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.checked || undefined)}
                  />
                )}
              />
            )}
          </form.Field>
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

function FateFields({ form }: { form: FactionFormApi }) {
  return (
    <form.Field name="rules.fate.label">
      {(labelField) => {
        const label = factionSpecialRuleLabel(labelField.state.value);
        return (
          <Section title={label}>
            <ControlBlock
              title="Section name"
              description="Used on this faction's page, in Play, and on its sheet and PDF."
              input={
                <Radio.Group
                  aria-label="Section name"
                  value={labelField.state.value ?? 'karama'}
                  onBlur={labelField.handleBlur}
                  onChange={(value) => labelField.handleChange(value === 'fate' ? 'fate' : undefined)}
                >
                  <Group gap="md">
                    <Radio value="karama" label={factionSpecialRuleLabels.karama} color="selected" />
                    <Radio value="fate" label={factionSpecialRuleLabels.fate} color="selected" />
                  </Group>
                </Radio.Group>
              }
            />
            <form.Field name="rules.fate.title">
              {(field) => (
                <ControlBlock
                  title="Rule title (optional)"
                  description="Leave blank when this rule does not need a separate title."
                  inputId="rules-fate-title"
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
            <form.Field name="rules.fate.text">
              {(field) => {
                return (
                  <ControlBlock
                    title="Rule text"
                    inputId="rules-fate-text"
                    warning={advisory(isBlank(field.state.value), `${label} text is empty.`)}
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
          </Section>
        );
      }}
    </form.Field>
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
