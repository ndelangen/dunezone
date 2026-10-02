import { Box, Grid, Stack, Text, TextInput } from '@mantine/core';
import { LEADERS } from '@shared/assetIds';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';

import type { Faction } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';

import { assetOptionToPreviewSrc } from './factionFormAssetUtils';
import type { FactionFormApi } from './factionFormTypes';

const leaderImageOptions = stockAssetOptions(LEADERS.options);

export function FactionFormSectionLeader({
  form,
  showPreview = true,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
}) {
  return (
    <Stack component="section" gap="md" aria-label="Faction leader">
      <Grid gap="xl" align="center">
        <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
          <Stack gap="md">
            <form.Field name="leader.name">
              {(field) => {
                const blank = field.state.value.trim().length === 0;
                return (
                  <Stack gap="md">
                    <ControlBlock
                      title="Faction leader name"
                      description="Printed around the leader portrait on the Faction shield."
                      input={
                        <TextInput
                          id="leader-name"
                          aria-label="Faction leader name"
                          value={field.state.value}
                          aria-describedby={blank ? 'leader-name-warning' : undefined}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.currentTarget.value)}
                        />
                      }
                    />
                    {blank ? (
                      <Text id="leader-name-warning" c="var(--color-caution)" size="xs" role="status">
                        The leader name is empty. This is advisory and does not prevent saving.
                      </Text>
                    ) : null}
                  </Stack>
                );
              }}
            </form.Field>

            <form.Field name="leader.image">
              {(field) => (
                <ControlBlock
                  title="Faction leader portrait"
                  input={
                    <AssetSelect
                      id="leader-image"
                      aria-label="Faction leader portrait"
                      allowDeselect={false}
                      data={leaderImageOptions}
                      getPreviewSrc={assetOptionToPreviewSrc}
                      value={field.state.value}
                      onChange={(value) => {
                        if (value) {
                          field.handleChange(value as Faction['leader']['image']);
                        }
                      }}
                    />
                  }
                />
              )}
            </form.Field>
          </Stack>
        </Grid.Col>

        {showPreview ? (
          <Grid.Col span={4} visibleFrom="sm">
            <form.Subscribe
              selector={(state) => ({
                background: state.values.background,
                leader: state.values.leader,
                logo: state.values.logo,
              })}
            >
              {({ background, leader, logo }) => (
                <Stack align="center" gap="sm">
                  <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
                    Used on: Faction shield
                  </Text>
                  <Box w={148} aria-label="Faction leader token preview">
                    <LeaderToken
                      background={background}
                      image={leader.image}
                      logo={logo}
                      name={leader.name}
                      strength={undefined}
                    />
                  </Box>
                </Stack>
              )}
            </form.Subscribe>
          </Grid.Col>
        ) : null}
      </Grid>
    </Stack>
  );
}
