import { arrayMove } from '@dnd-kit/sortable';
import {
  Alert,
  Group,
  Input,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  DEFAULT_PHASE_PRIORITY,
  PHASE_TYPE_LABELS,
  PHASE_TYPES,
  phaseDeclarationProblems,
  phaseTargetLabel,
  SETUP_PHASE_TARGETS,
} from '@shared/factions/extraPhases';
import type { PhaseDeclaration, PhaseTarget } from '@shared/factions/extraPhases';
import { TABLE_PHASES } from '@shared/play/phases';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { useState } from 'react';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { assetOptionToPreviewSrc, phaseSymbolOptions, phaseSymbolOptionToLabel } from './factionFormAssetUtils';
import { defaultPhaseDeclaration } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

const symbolSelectOptions = phaseSymbolOptions.map((value) => ({ value, label: phaseSymbolOptionToLabel(value) }));

/* Grouped so the author reads the consequence of a target: once in setup, or every turn. */
const placementOptions = [
  {
    group: 'Setup',
    items: SETUP_PHASE_TARGETS.map((target) => ({ value: target.id, label: `Before ${target.label}` })),
  },
  { group: 'Every turn', items: TABLE_PHASES.map((phase) => ({ value: phase.id, label: `Before ${phase.label}` })) },
];

const typeOptions = PHASE_TYPES.map((type) => ({ value: type, label: PHASE_TYPE_LABELS[type] }));

/** The editor's name for a row: its title, or its place in the list while the title is blank. */
export function phaseRowLabel(declaration: Partial<PhaseDeclaration> | undefined, index: number): string {
  return declaration?.title?.trim() || `Phase ${index + 1}`;
}

type PhaseProblems = ReturnType<typeof phaseDeclarationProblems>;

/* Symbol and placement: the two choices only the author can make, besides the title. */
function PhasePlacementFields({
  form,
  index,
  problems,
}: {
  form: FactionFormApi;
  index: number;
  problems: PhaseProblems;
}) {
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={`extraPhases[${index}].symbol`}>
          {(field) => (
            <Input.Wrapper id={`phase-${index}-symbol`} label="Symbol" required error={problems.symbol}>
              <AssetSelect
                id={`phase-${index}-symbol`}
                aria-label="Symbol"
                allowDeselect={false}
                data={symbolSelectOptions}
                getPreviewSrc={assetOptionToPreviewSrc}
                glyphPreviews
                value={field.state.value ?? null}
                onChange={(value) => {
                  if (value) {
                    field.handleChange(value as PhaseDeclaration['symbol']);
                  }
                }}
              />
            </Input.Wrapper>
          )}
        </form.Field>

        <form.Field name={`extraPhases[${index}].before`}>
          {(field) => (
            <Select
              id={`phase-${index}-placement`}
              label="Placement"
              required
              allowDeselect={false}
              data={placementOptions}
              value={field.state.value ?? null}
              error={problems.before}
              onChange={(value) => {
                if (value) {
                  field.handleChange(value as PhaseTarget);
                }
              }}
            />
          )}
        </form.Field>
      </SimpleGrid>
    </>
  );
}

/* Type, priority and readiness: each starts from its default, so a new row is valid without them. */
function PhaseBehaviourFields({
  form,
  index,
  problems,
}: {
  form: FactionFormApi;
  index: number;
  problems: PhaseProblems;
}) {
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={`extraPhases[${index}].type`}>
          {(field) => (
            <Select
              id={`phase-${index}-type`}
              label="Type"
              description="Prediction uses the built-in prediction controls."
              allowDeselect={false}
              data={typeOptions}
              value={field.state.value ?? null}
              error={problems.type}
              onChange={(value) => {
                if (value) {
                  field.handleChange(value as PhaseDeclaration['type']);
                }
              }}
            />
          )}
        </form.Field>

        <form.Field name={`extraPhases[${index}].priority`}>
          {(field) => (
            <NumberInput
              id={`phase-${index}-priority`}
              label="Priority"
              description="Lower runs first among phases before the same step."
              allowDecimal
              value={field.state.value ?? ''}
              error={problems.priority}
              onBlur={field.handleBlur}
              /* An empty or fractional entry is kept as typed, so the row names the problem rather than hiding it. */
              onChange={(value) => field.handleChange(value as number)}
            />
          )}
        </form.Field>
      </SimpleGrid>

      <form.Field name={`extraPhases[${index}].allPlayersMustBeReady`}>
        {(field) => (
          <ControlBlock
            title="Everyone must be ready"
            description="Next waits until every player is ready, like Mentat pause. A prediction phase gates on its lock instead."
            input={
              <Switch
                id={`phase-${index}-ready`}
                aria-label="Everyone must be ready"
                checked={field.state.value ?? false}
                onChange={(event) => field.handleChange(event.currentTarget.checked)}
              />
            }
          />
        )}
      </form.Field>
    </>
  );
}

function PhaseCard({ form, index }: { form: FactionFormApi; index: number }) {
  return (
    <form.Subscribe selector={(state) => state.values.extraPhases?.[index]}>
      {(declaration) => {
        if (!declaration) {
          return null;
        }
        const problems = phaseDeclarationProblems(declaration);
        return (
          <Stack gap="md" data-phase-row={index}>
            <Text fw={700}>{phaseRowLabel(declaration, index)}</Text>

            <form.Field name={`extraPhases[${index}].title`}>
              {(field) => (
                <TextInput
                  id={`phase-${index}-title`}
                  label="Title"
                  description="Shown to players in the phase header and on the tracker."
                  required
                  value={field.state.value ?? ''}
                  error={problems.title}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                />
              )}
            </form.Field>

            <PhasePlacementFields form={form} index={index} problems={problems} />

            <form.Field name={`extraPhases[${index}].instructions`}>
              {(field) => (
                <Textarea
                  id={`phase-${index}-instructions`}
                  label="Instructions"
                  description="What players do during this phase. Optional."
                  autosize
                  minRows={3}
                  value={field.state.value ?? ''}
                  error={problems.instructions}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
                />
              )}
            </form.Field>

            <PhaseBehaviourFields form={form} index={index} problems={problems} />
          </Stack>
        );
      }}
    </form.Subscribe>
  );
}

export function FactionFormSectionPhases({
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
    <Stack component="section" gap="md" aria-labelledby="phases-heading">
      <Stack gap="xs">
        <Text id="phases-heading" fw={700} size="lg">
          Faction phases
        </Text>
        <Text c="dimmed" size="sm">
          Phases this faction adds to the game. A phase before a setup step runs once; a phase before a turn phase runs
          every turn. Phases before the same step run by priority, then in storm order between factions, then in this
          list&apos;s order. Priority {DEFAULT_PHASE_PRIORITY} is the default.
        </Text>
      </Stack>

      <form.Field name="extraPhases" mode="array">
        {(field) => {
          const phases = field.state.value ?? [];
          const count = phases.length;
          const safeSelectedIndex = Math.min(Math.max(currentSelectedIndex, 0), Math.max(count - 1, 0));
          const sortablePrefix = 'phases-';
          return (
            <Stack gap="md">
              <Group justify="flex-end">
                <ListLengthActions
                  removeLabel="Remove last faction phase"
                  addLabel="Add faction phase"
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
                    field.pushValue(defaultPhaseDeclaration());
                    selectIndex(count);
                  }}
                />
              </Group>

              {count === 0 ? (
                <Alert color="gray" variant="light" title="No faction phases">
                  This faction adds no phases. The game runs the standard setup and turn.
                </Alert>
              ) : (
                <>
                  <FactionCollectionShelf
                    label="Ordered faction phases"
                    sortablePrefix={sortablePrefix}
                    selectedIndex={safeSelectedIndex}
                    onSelectedIndexChange={selectIndex}
                    items={phases.map((declaration, index) => {
                      const invalid = Object.keys(phaseDeclarationProblems(declaration)).length > 0;
                      return {
                        id: `${sortablePrefix}${index}`,
                        label: phaseRowLabel(declaration, index),
                        description: invalid
                          ? 'Needs attention'
                          : `Before ${phaseTargetLabel(declaration.before)}, priority ${declaration.priority}`,
                      };
                    })}
                    onMove={(from, to) => field.handleChange(arrayMove(phases, from, to))}
                  />
                  <PhaseCard form={form} index={safeSelectedIndex} />
                </>
              )}
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}
