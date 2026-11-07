import { arrayMove } from '@dnd-kit/sortable';
import { Grid, Stack } from '@mantine/core';
import { SUPPORTING_LEADER_LIMIT } from '@shared/factions/schema';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useLayoutEffect, useRef } from 'react';

import { LeaderStrengthInput } from '@app/widgets/leader-strength/LeaderStrengthInput';

import { nextLeaderFromLast } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';
import { FactionListSection, useListSelection } from './FactionListSection';
import { LeaderNameField, LeaderPortraitField, LeaderRow, LeaderTokenPreview } from './LeaderFields';

const CONVENTIONAL_SUPPORTING_LEADER_COUNT = 5;

/** Strength text a leader's field could not take, owned by the authoring session so replacing the draft clears it. */
export type StrengthRefusal = { leader: number; text: string } | null;

export type StrengthRefusalProps = {
  strengthRefusal: StrengthRefusal;
  onStrengthRefusalChange: (refusal: StrengthRefusal) => void;
};

export function canAddSupportingLeader(count: number): boolean {
  return count >= 0 && count < SUPPORTING_LEADER_LIMIT;
}

function SupportingLeaderCard({
  form,
  index,
  showPreview,
  strengthRefusal,
  onStrengthRefusalChange,
}: {
  form: FactionFormApi;
  index: number;
  showPreview: boolean;
} & StrengthRefusalProps) {
  const leader = form.state.values.leaders[index];
  if (!leader) {
    return null;
  }

  return (
    <Stack gap="md">
      <LeaderRow
        fields={
          <>
            <form.Field name={`leaders[${index}].name`}>
              {(field) => (
                <LeaderNameField
                  title="Leader name"
                  description="Printed around this leader token."
                  inputId={`leader-${index}-name`}
                  blankWarning="This leader has no name. This is advisory and does not prevent saving."
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>

            <Grid>
              <Grid.Col span={{ base: 12, xs: 4 }}>
                <form.Field name={`leaders[${index}].strength`}>
                  {(field) => (
                    <ControlBlock
                      title="Strength"
                      description="A whole number or one character. Leave blank to omit."
                      input={
                        <LeaderStrengthInput
                          id={`leader-${index}-str`}
                          value={field.state.value}
                          refused={strengthRefusal?.leader === index ? strengthRefusal.text : null}
                          onRefusedChange={(text) =>
                            onStrengthRefusalChange(text === null ? null : { leader: index, text })
                          }
                          onBlur={field.handleBlur}
                          onChange={field.handleChange}
                        />
                      }
                    />
                  )}
                </form.Field>
              </Grid.Col>
              <Grid.Col span={{ base: 12, xs: 8 }}>
                <form.Field name={`leaders[${index}].image`}>
                  {(field) => (
                    <LeaderPortraitField
                      title="Leader portrait"
                      inputId={`leader-${index}-img`}
                      value={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              </Grid.Col>
            </Grid>
          </>
        }
        preview={
          showPreview ? (
            <form.Subscribe
              selector={(state) => ({
                background: state.values.background,
                leader: state.values.leaders[index],
                emblem: state.values.emblem,
              })}
            >
              {({ background, leader: currentLeader, emblem }) =>
                currentLeader ? (
                  <LeaderTokenPreview
                    caption="Used as: leader token"
                    width={132}
                    label={`Token preview for supporting leader ${index + 1}`}
                    background={background}
                    image={currentLeader.image}
                    emblem={emblem}
                    name={currentLeader.name}
                    strength={currentLeader.strength}
                  />
                ) : null
              }
            </form.Subscribe>
          ) : null
        }
      />
    </Stack>
  );
}

export function FactionFormSectionLeaders({
  form,
  showPreview = true,
  selectedIndex,
  onSelectedIndexChange,
  strengthRefusal,
  onStrengthRefusalChange,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
} & StrengthRefusalProps) {
  const [selected, setSelectedIndex] = useListSelection(selectedIndex, onSelectedIndexChange);
  /* Moving to another leader drops text the last one refused, so coming back shows its saved strength. */
  const selectIndex = (index: number) => {
    if (strengthRefusal !== null) {
      onStrengthRefusalChange(null);
    }
    setSelectedIndex(index);
  };
  const pendingLeaderFocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    const pendingLeaderFocusId = pendingLeaderFocus.current;
    if (pendingLeaderFocusId == null) {
      return;
    }
    if (typeof document !== 'undefined') {
      const target = document.getElementById(pendingLeaderFocusId);
      if (target instanceof HTMLInputElement) {
        pendingLeaderFocus.current = null;
        target.focus();
        target.select();
      }
    }
  });

  return (
    <form.Field name="leaders" mode="array">
      {(field) => {
        const count = field.state.value.length;
        return (
          <FactionListSection
            title="Supporting leaders"
            help={'The leaders this faction fields besides its faction leader.\nMost factions use five.'}
            note={
              count === 0
                ? {
                    tone: 'caution',
                    title: 'No supporting leaders',
                    text: 'Zero is valid, but unusual. Most factions use five supporting leaders.',
                  }
                : count !== CONVENTIONAL_SUPPORTING_LEADER_COUNT
                  ? { text: 'Most factions use five supporting leaders; this roster is still valid.' }
                  : null
            }
            badge={<StatusBadge>{`${count} / ${SUPPORTING_LEADER_LIMIT}`}</StatusBadge>}
            noun="supporting leader"
            sortablePrefix="leaders-"
            values={field.state.value}
            describe={(leader) => ({
              label: leader.name.trim() || 'Unnamed leader',
              description: leader.strength === undefined ? 'No strength' : `Strength ${leader.strength}`,
            })}
            selected={selected}
            onSelect={selectIndex}
            addDisabled={!canAddSupportingLeader(count)}
            onAdd={() => {
              field.pushValue(nextLeaderFromLast(field.state.value[count - 1]));
              pendingLeaderFocus.current = `leader-${count}-name`;
            }}
            onRemoveLast={() => field.removeValue(count - 1)}
            onMove={(from, to) => field.handleChange(arrayMove(field.state.value, from, to))}
          >
            {(index) => (
              <SupportingLeaderCard
                form={form}
                index={index}
                showPreview={showPreview}
                strengthRefusal={strengthRefusal}
                onStrengthRefusalChange={onStrengthRefusalChange}
              />
            )}
          </FactionListSection>
        );
      }}
    </form.Field>
  );
}
