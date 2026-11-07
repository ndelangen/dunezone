import { arrayMove } from '@dnd-kit/sortable';
import { Input, NumberInput, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
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
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';

import { assetOptionToPreviewSrc, phaseSymbolOptions } from './factionFormAssetUtils';
import { defaultPhaseDeclaration } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';
import { FactionListSection, useListSelection } from './FactionListSection';

const symbolSelectOptions = stockAssetOptions(phaseSymbolOptions);

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
            <ControlBlock
              title="Placement"
              inputId={`phase-${index}-placement`}
              input={(fieldProps) => (
                <Select
                  {...fieldProps}
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
            <ControlBlock
              title="Type"
              description="Prediction uses the built-in prediction controls and goes before a setup step."
              inputId={`phase-${index}-type`}
              input={(fieldProps) => (
                <Select
                  {...fieldProps}
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
            />
          )}
        </form.Field>

        <form.Field name={`extraPhases[${index}].priority`}>
          {(field) => (
            <ControlBlock
              title="Priority"
              description="Lower runs first among phases before the same step."
              inputId={`phase-${index}-priority`}
              input={(fieldProps) => (
                <NumberInput
                  {...fieldProps}
                  allowDecimal
                  value={field.state.value ?? ''}
                  error={problems.priority}
                  onBlur={field.handleBlur}
                  onChange={(value) => field.handleChange(value as number)}
                />
              )}
            />
          )}
        </form.Field>
      </SimpleGrid>

      <form.Field name={`extraPhases[${index}].allPlayersMustBeReady`}>
        {(field) => (
          <ControlBlock
            title="Everyone must be ready"
            description={
              'Next waits until every player is ready, like Mentat Pause.\nA prediction phase waits on its lock instead.'
            }
            inputId={`phase-${index}-ready`}
            input={(fieldProps) => (
              <Switch
                {...fieldProps}
                checked={field.state.value ?? false}
                onChange={(event) => field.handleChange(event.currentTarget.checked)}
              />
            )}
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
                <ControlBlock
                  title="Title"
                  description="Shown to players in the phase header and on the tracker."
                  inputId={`phase-${index}-title`}
                  input={(fieldProps) => (
                    <TextInput
                      {...fieldProps}
                      required
                      value={field.state.value ?? ''}
                      error={problems.title}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                    />
                  )}
                />
              )}
            </form.Field>

            <PhasePlacementFields form={form} index={index} problems={problems} />

            <form.Field name={`extraPhases[${index}].instructions`}>
              {(field) => (
                <ControlBlock
                  title="Instructions"
                  description="What players do during this phase. Optional."
                  inputId={`phase-${index}-instructions`}
                  input={(fieldProps) => (
                    <Textarea
                      {...fieldProps}
                      minRows={3}
                      value={field.state.value ?? ''}
                      error={problems.instructions}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.value || undefined)}
                    />
                  )}
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
  const [selected, select] = useListSelection(selectedIndex, onSelectedIndexChange);
  return (
    <form.Field name="extraPhases" mode="array">
      {(field) => {
        const phases = field.state.value ?? [];
        return (
          <FactionListSection
            title="Faction phases"
            help={`Phases this faction adds to the game.\nBefore a setup step: runs once. Before a turn phase: runs every turn.\nSame step: by priority, then storm order, then this list's order.\nPriority ${DEFAULT_PHASE_PRIORITY} is the default.`}
            note={
              phases.length === 0
                ? {
                    title: 'No faction phases',
                    text: 'This faction adds no phases. The game runs the standard setup and turn.',
                  }
                : null
            }
            noun="faction phase"
            sortablePrefix="phases-"
            values={phases}
            describe={(declaration, index) => ({
              label: phaseRowLabel(declaration, index),
              description:
                Object.keys(phaseDeclarationProblems(declaration)).length > 0
                  ? 'Needs attention'
                  : `Before ${phaseTargetLabel(declaration.before)}, priority ${declaration.priority}`,
            })}
            selected={selected}
            onSelect={select}
            onAdd={() => field.pushValue(defaultPhaseDeclaration())}
            onRemoveLast={() => field.removeValue(phases.length - 1)}
            onMove={(from, to) => field.handleChange(arrayMove(phases, from, to))}
          >
            {(index) => <PhaseCard form={form} index={index} />}
          </FactionListSection>
        );
      }}
    </form.Field>
  );
}
