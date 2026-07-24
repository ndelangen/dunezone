import { Box, Grid, Group, Image, Select, Stack, Text, TextInput } from '@mantine/core';

import type { Faction } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { LEADERS } from '@game/data/generated';

import { assetOptionToPreviewSrc, leaderOptionToLabel } from './factionFormAssetUtils';
import type { FactionFormApi } from './factionFormTypes';

const leaderImageOptions = LEADERS.options.map((value) => ({
  value,
  label: leaderOptionToLabel(value),
}));

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

export function FactionFormSectionHero({
  form,
  showPreview = true,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
}) {
  return (
    <Stack component="section" gap="md" aria-labelledby="faction-leader-heading">
      <Stack gap={2}>
        <Text id="faction-leader-heading" fw={700} size="lg">
          Faction leader
        </Text>
        <Text c="dimmed" size="sm">
          Every faction has one required hero. This leader is used on the Faction shield.
        </Text>
      </Stack>

      <Grid gap="xl" align="center">
        <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
          <Stack gap="md">
            <form.Field name="hero.name">
              {(field) => {
                const blank = field.state.value.trim().length === 0;
                return (
                  <Stack gap={4}>
                    <TextInput
                      id="hero-name"
                      label="Faction leader name"
                      description="Printed around the leader portrait on the Faction shield."
                      value={field.state.value}
                      aria-describedby={blank ? 'hero-name-warning' : undefined}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                    />
                    {blank ? (
                      <Text id="hero-name-warning" c="yellow.9" size="xs" role="status">
                        The leader name is empty. This is advisory and does not prevent saving.
                      </Text>
                    ) : null}
                  </Stack>
                );
              }}
            </form.Field>

            <form.Field name="hero.image">
              {(field) => (
                <Select
                  id="hero-image"
                  label="Faction leader portrait"
                  description="Choose the portrait rendered for this hero."
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
                    if (value) field.handleChange(value as Faction['hero']['image']);
                  }}
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
                hero: state.values.hero,
                logo: state.values.logo,
              })}
            >
              {({ background, hero, logo }) => (
                <Stack align="center" gap="sm">
                  <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
                    Used on: Faction shield
                  </Text>
                  <Box w={148} aria-label="Faction leader token preview">
                    <LeaderToken
                      background={background}
                      image={hero.image}
                      logo={logo}
                      name={hero.name}
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
