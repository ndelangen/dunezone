import { arrayMove } from '@dnd-kit/sortable';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Image,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { Plus, Trash2 } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';

import type { Faction } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { LEADERS } from '@game/data/generated';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import { assetOptionToPreviewSrc, leaderOptionToLabel } from './factionFormAssetUtils';
import { nextLeaderFromLast } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

export const SUPPORTING_LEADER_LIMIT = 10;
export const CONVENTIONAL_SUPPORTING_LEADER_COUNT = 5;

const leaderImageOptions = LEADERS.options.map((value) => ({
  value,
  label: leaderOptionToLabel(value),
}));

export function canAddSupportingLeader(count: number): boolean {
  return count >= 0 && count < SUPPORTING_LEADER_LIMIT;
}

function LeaderImageOption({ value, label }: { value: string; label: string }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Image src={assetOptionToPreviewSrc(value)} alt="" w={32} h={32} fit="contain" />
      <Text size="sm" truncate>
        {label}
      </Text>
    </Group>
  );
}

function SupportingLeaderCard({
  form,
  index,
  onRemove,
  showPreview,
}: {
  form: FactionFormApi;
  index: number;
  onRemove: () => void;
  showPreview: boolean;
}) {
  const leader = form.state.values.leaders[index];
  if (!leader) return null;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Box>
            <Text fw={700}>Supporting leader {index + 1}</Text>
            <Text size="xs" c="dimmed">
              {leader.name.trim() || 'Unnamed leader'}
            </Text>
          </Box>
          <Tooltip label={`Remove supporting leader ${index + 1}`}>
            <ActionIcon
              type="button"
              variant="light"
              color="red"
              aria-label={`Remove supporting leader ${index + 1}`}
              onClick={onRemove}
            >
              <Trash2 size={16} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Grid gap="xl" align="center">
          <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
            <Stack gap="md">
              <form.Field name={`leaders[${index}].name`}>
                {(field) => {
                  const blank = field.state.value.trim().length === 0;
                  const warningId = `leader-${index}-name-warning`;
                  return (
                    <Stack gap={4}>
                      <TextInput
                        id={`leader-${index}-name`}
                        label="Leader name"
                        description="Printed around this leader token."
                        value={field.state.value}
                        aria-describedby={blank ? warningId : undefined}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.currentTarget.value)}
                      />
                      {blank ? (
                        <Text id={warningId} c="yellow.9" size="xs" role="status">
                          This leader has no name. This is advisory and does not prevent saving.
                        </Text>
                      ) : null}
                    </Stack>
                  );
                }}
              </form.Field>

              <Grid>
                <Grid.Col span={{ base: 12, xs: 4 }}>
                  <form.Field name={`leaders[${index}].strength`}>
                    {(field) => (
                      <TextInput
                        id={`leader-${index}-str`}
                        label="Strength"
                        description="A whole number or one character. Leave blank to omit."
                        inputMode="text"
                        autoComplete="off"
                        value={
                          field.state.value === undefined || field.state.value === null
                            ? ''
                            : String(field.state.value)
                        }
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          const raw = event.currentTarget.value;
                          if (raw === '') {
                            field.handleChange(undefined);
                          } else if (/^-?\d+$/u.test(raw)) {
                            field.handleChange(Number.parseInt(raw, 10));
                          } else if (raw.length === 1) {
                            field.handleChange(raw);
                          }
                        }}
                      />
                    )}
                  </form.Field>
                </Grid.Col>
                <Grid.Col span={{ base: 12, xs: 8 }}>
                  <form.Field name={`leaders[${index}].image`}>
                    {(field) => (
                      <Select
                        id={`leader-${index}-img`}
                        label="Leader portrait"
                        description="Choose the portrait rendered on this token."
                        searchable
                        allowDeselect={false}
                        limit={24}
                        data={leaderImageOptions}
                        value={field.state.value}
                        leftSection={
                          <Image
                            src={assetOptionToPreviewSrc(field.state.value)}
                            alt=""
                            w={24}
                            h={24}
                            fit="contain"
                          />
                        }
                        renderOption={({ option }) => (
                          <LeaderImageOption value={option.value} label={option.label} />
                        )}
                        comboboxProps={{ withinPortal: false }}
                        onChange={(value) => {
                          if (value) {
                            field.handleChange(value as Faction['leaders'][number]['image']);
                          }
                        }}
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
                  logo: state.values.logo,
                })}
              >
                {({ background, leader: currentLeader, logo }) =>
                  currentLeader ? (
                    <Stack align="center" gap="sm">
                      <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
                        Used as: leader token
                      </Text>
                      <Box w={132} aria-label={`Token preview for supporting leader ${index + 1}`}>
                        <LeaderToken
                          background={background}
                          image={currentLeader.image}
                          logo={logo}
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
    </Paper>
  );
}

export function FactionFormSectionLeaders({
  form,
  showPreview = true,
  selectedIndex,
  onSelectedIndexChange,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
}) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
  const currentSelectedIndex = selectedIndex ?? internalSelectedIndex;
  const selectIndex = onSelectedIndexChange ?? setInternalSelectedIndex;
  const [pendingLeaderFocusId, setPendingLeaderFocusId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (pendingLeaderFocusId == null) return;
    if (typeof document !== 'undefined') {
      const target = document.getElementById(pendingLeaderFocusId);
      if (target instanceof HTMLInputElement) {
        target.focus();
        target.select();
      }
    }
    setPendingLeaderFocusId(null);
  }, [pendingLeaderFocusId]);

  return (
    <Stack component="section" gap="md" aria-labelledby="supporting-leaders-heading">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Text id="supporting-leaders-heading" fw={700} size="lg">
            Supporting leaders
          </Text>
          <Text c="dimmed" size="sm">
            Add zero to ten leaders and arrange the order used on faction artifacts.
          </Text>
        </Box>
        <form.Subscribe selector={(state) => state.values.leaders.length}>
          {(count) => (
            <Badge
              variant="light"
              color={count === CONVENTIONAL_SUPPORTING_LEADER_COUNT ? 'dune' : 'gray'}
            >
              {count} / {SUPPORTING_LEADER_LIMIT}
            </Badge>
          )}
        </form.Subscribe>
      </Group>

      <form.Field name="leaders" mode="array">
        {(field) => {
          const sortablePrefix = 'leaders-';
          const canAdd = canAddSupportingLeader(field.state.value.length);
          const safeSelectedIndex = Math.min(
            Math.max(currentSelectedIndex, 0),
            Math.max(field.state.value.length - 1, 0)
          );
          return (
            <Stack gap="md">
              {field.state.value.length === 0 ? (
                <Alert color="yellow" variant="light" title="No supporting leaders">
                  Zero is valid, but unusual. Most factions use five supporting leaders.
                </Alert>
              ) : field.state.value.length !== CONVENTIONAL_SUPPORTING_LEADER_COUNT ? (
                <Alert color="gray" variant="light">
                  Most factions use five supporting leaders; this roster is still valid.
                </Alert>
              ) : null}

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
                      description:
                        leader.strength === undefined
                          ? 'No strength'
                          : `Strength ${leader.strength}`,
                    }))}
                    onMove={(from, to) =>
                      field.handleChange(arrayMove(field.state.value, from, to))
                    }
                  />
                  <SupportingLeaderCard
                    form={form}
                    index={safeSelectedIndex}
                    onRemove={() => {
                      field.removeValue(safeSelectedIndex);
                      selectIndex(
                        Math.max(0, Math.min(safeSelectedIndex, field.state.value.length - 2))
                      );
                    }}
                    showPreview={showPreview}
                  />
                </>
              ) : null}

              <Button
                type="button"
                variant="light"
                color="dune"
                leftSection={<Plus size={16} aria-hidden />}
                disabled={!canAdd}
                onClick={() => {
                  if (!canAdd) return;
                  const newIndex = field.state.value.length;
                  field.pushValue(nextLeaderFromLast(field.state.value[newIndex - 1]));
                  selectIndex(newIndex);
                  setPendingLeaderFocusId(`leader-${newIndex}-name`);
                }}
              >
                {canAdd ? 'Add supporting leader' : 'Maximum of 10 leaders reached'}
              </Button>
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}
