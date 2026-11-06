import { arrayMove } from '@dnd-kit/sortable';
import { Box, Grid, Stack, TextInput } from '@mantine/core';
import { LEADERS } from '@shared/assetIds';
import { SUPPORTING_LEADER_LIMIT } from '@shared/factions/schema';
import { ListChapter } from '@ui/block/ListChapter';
import { Eyebrow } from '@ui/content/Eyebrow';
import { StatusBadge } from '@ui/content/StatusBadge';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { useLayoutEffect, useRef, useState } from 'react';

import type { Faction } from '@db/factions';
import { LeaderStrengthInput } from '@app/widgets/leader-strength/LeaderStrengthInput';
import { LeaderToken } from '@game/assets/faction/leader/Leader';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { assetOptionToPreviewSrc } from './factionFormAssetUtils';
import { nextLeaderFromLast } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

const CONVENTIONAL_SUPPORTING_LEADER_COUNT = 5;

const leaderImageOptions = stockAssetOptions(LEADERS.options);

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
      <Grid gap="xl" align="center">
        <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
          <Stack gap="md">
            <form.Field name={`leaders[${index}].name`}>
              {(field) => {
                const value = field.state.value ?? '';
                const blank = value.trim().length === 0;
                return (
                  <ControlBlock
                    title="Leader name"
                    description="Printed around this leader token."
                    inputId={`leader-${index}-name`}
                    warning={
                      blank ? 'This leader has no name. This is advisory and does not prevent saving.' : undefined
                    }
                    input={(control) => (
                      <TextInput
                        {...control}
                        value={value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.currentTarget.value)}
                      />
                    )}
                  />
                );
              }}
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
                    <ControlBlock
                      title="Leader portrait"
                      input={
                        <AssetSelect
                          id={`leader-${index}-img`}
                          aria-label="Leader portrait"
                          allowDeselect={false}
                          data={leaderImageOptions}
                          previewShape="disc"
                          getPreviewSrc={assetOptionToPreviewSrc}
                          value={field.state.value}
                          onChange={(value) => {
                            if (value) {
                              field.handleChange(value as Faction['leaders'][number]['image']);
                            }
                          }}
                        />
                      }
                    />
                  )}
                </form.Field>
              </Grid.Col>
            </Grid>
          </Stack>
        </Grid.Col>

        {showPreview ? (
          <Grid.Col span={4} visibleFrom="sm">
            <form.Subscribe
              selector={(state) => ({
                background: state.values.background,
                leader: state.values.leaders[index],
                emblem: state.values.emblem,
              })}
            >
              {({ background, leader: currentLeader, emblem }) =>
                currentLeader ? (
                  <Stack align="center" gap="sm">
                    <Eyebrow align="center">Used as: leader token</Eyebrow>
                    <Box w={132} aria-label={`Token preview for supporting leader ${index + 1}`}>
                      <LeaderToken
                        background={background}
                        image={currentLeader.image}
                        emblem={emblem}
                        name={currentLeader.name}
                        strength={currentLeader.strength}
                      />
                    </Box>
                  </Stack>
                ) : null
              }
            </form.Subscribe>
          </Grid.Col>
        ) : null}
      </Grid>
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
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
  const currentSelectedIndex = selectedIndex ?? internalSelectedIndex;
  const setSelectedIndex = onSelectedIndexChange ?? setInternalSelectedIndex;
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
        const sortablePrefix = 'leaders-';
        const count = field.state.value.length;
        const canAdd = canAddSupportingLeader(count);
        const safeSelectedIndex = Math.min(Math.max(currentSelectedIndex, 0), Math.max(count - 1, 0));
        return (
          <ListChapter
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
            actions={
              <>
                <StatusBadge>{`${count} / ${SUPPORTING_LEADER_LIMIT}`}</StatusBadge>
                <ListLengthActions
                  removeLabel="Remove last supporting leader"
                  addLabel="Add supporting leader"
                  removeDisabled={count === 0}
                  addDisabled={!canAdd}
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
                    if (!canAdd) {
                      return;
                    }
                    const newIndex = count;
                    field.pushValue(nextLeaderFromLast(field.state.value[newIndex - 1]));
                    pendingLeaderFocus.current = `leader-${newIndex}-name`;
                    selectIndex(newIndex);
                  }}
                />
              </>
            }
          >
            {field.state.value.length > 0 ? (
              <>
                <FactionCollectionShelf
                  label="Ordered supporting leaders"
                  sortablePrefix={sortablePrefix}
                  selectedIndex={safeSelectedIndex}
                  onSelectedIndexChange={selectIndex}
                  items={field.state.value.map((leader, index) => ({
                    id: `${sortablePrefix}${index}`,
                    label: leader.name.trim() || 'Unnamed leader',
                    description: leader.strength === undefined ? 'No strength' : `Strength ${leader.strength}`,
                  }))}
                  onMove={(from, to) => field.handleChange(arrayMove(field.state.value, from, to))}
                />
                <SupportingLeaderCard
                  form={form}
                  index={safeSelectedIndex}
                  showPreview={showPreview}
                  strengthRefusal={strengthRefusal}
                  onStrengthRefusalChange={onStrengthRefusalChange}
                />
              </>
            ) : null}
          </ListChapter>
        );
      }}
    </form.Field>
  );
}
