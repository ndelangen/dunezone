import { Box, Grid, Stack, TextInput } from '@mantine/core';
import { LEADERS } from '@shared/assetIds';
import { Eyebrow } from '@ui/content/Eyebrow';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';

import type { Faction } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';

import { assetOptionToPreviewSrc } from './factionFormAssetUtils';
import type { FactionFormApi } from './factionFormTypes';

const leaderImageOptions = stockAssetOptions(LEADERS.options);

export function FactionFormSectionFactionLeader({
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
            <form.Field name="factionLeader.name">
              {(field) => {
                const blank = field.state.value.trim().length === 0;
                return (
                  <ControlBlock
                    title="Faction leader name"
                    description="Printed around the faction leader portrait on the Faction shield."
                    inputId="faction-leader-name"
                    warning={
                      blank
                        ? 'The faction leader name is empty. This is advisory and does not prevent saving.'
                        : undefined
                    }
                    input={(control) => (
                      <TextInput
                        {...control}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.currentTarget.value)}
                      />
                    )}
                  />
                );
              }}
            </form.Field>

            <form.Field name="factionLeader.image">
              {(field) => (
                <ControlBlock
                  title="Faction leader portrait"
                  inputId="faction-leader-image"
                  input={(fieldProps) => (
                    <AssetSelect
                      {...fieldProps}
                      allowDeselect={false}
                      data={leaderImageOptions}
                      previewShape="disc"
                      getPreviewSrc={assetOptionToPreviewSrc}
                      value={field.state.value}
                      onChange={(value) => {
                        if (value) {
                          field.handleChange(value as Faction['factionLeader']['image']);
                        }
                      }}
                    />
                  )}
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
                factionLeader: state.values.factionLeader,
                emblem: state.values.emblem,
              })}
            >
              {({ background, factionLeader, emblem }) => (
                <Stack align="center" gap="sm">
                  <Eyebrow align="center">Used on: Faction shield</Eyebrow>
                  <Box w={148} aria-label="Faction leader token preview">
                    <LeaderToken
                      background={background}
                      image={factionLeader.image}
                      emblem={emblem}
                      name={factionLeader.name}
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
