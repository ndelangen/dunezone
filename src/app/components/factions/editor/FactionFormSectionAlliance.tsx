import { arrayMove } from '@dnd-kit/sortable';
import {
  Alert,
  Box,
  Grid,
  Group,
  NumberInput,
  Paper,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import { useState } from 'react';

import type { Faction } from '@db/factions';
import { AssetSelect } from '@app/components/content/FormControls/AssetSelect';
import { ControlBlock } from '@app/components/content/FormControls/ControlBlock';
import { ListLengthActions } from '@app/components/content/FormControls/ListLengthActions';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';

import { FactionCollectionShelf } from './FactionCollectionShelf';
import styles from './FactionFormSectionAlliance.module.css';
import {
  assetOptionToPreviewSrc,
  decalAssetOptions,
  decalAssetOptionToLabel,
} from './factionFormAssetUtils';
import { defaultDecal } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

const decalOptions = decalAssetOptions.map((value) => ({
  value,
  label: decalAssetOptionToLabel(value),
}));

function DecalCard({ form, index }: { form: FactionFormApi; index: number }) {
  const decal = form.state.values.decals[index];
  if (!decal) return null;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Box>
          <Text fw={700}>Alliance decal {index + 1}</Text>
          <Text size="xs" c="dimmed">
            {decalAssetOptionToLabel(decal.id)}
          </Text>
        </Box>

        <form.Field name={`decals[${index}].id`}>
          {(field) => (
            <ControlBlock
              title="Decal asset"
              description="Artwork layered onto the alliance card in collection order."
              input={
                <AssetSelect
                  id={`decal-${index}-id`}
                  aria-label="Decal asset"
                  allowDeselect={false}
                  limit={30}
                  data={decalOptions}
                  getPreviewSrc={assetOptionToPreviewSrc}
                  value={field.state.value}
                  onChange={(value) => {
                    if (value) field.handleChange(value as Faction['decals'][number]['id']);
                  }}
                />
              }
            />
          )}
        </form.Field>

        <Grid>
          <Grid.Col span={{ base: 12, xs: 6 }}>
            <form.Field name={`decals[${index}].muted`}>
              {(field) => (
                <ControlBlock
                  title="Muted treatment"
                  description="Uses the artwork as a subtle cutout layer."
                  input={
                    <Switch
                      id={`decal-${index}-muted`}
                      aria-label="Muted treatment"
                      checked={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.checked)}
                    />
                  }
                />
              )}
            </form.Field>
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 6 }}>
            <form.Field name={`decals[${index}].outline`}>
              {(field) => (
                <ControlBlock
                  title="Outline artwork"
                  description="Adds a light border around an unmuted decal."
                  input={
                    <Switch
                      id={`decal-${index}-outline`}
                      aria-label="Outline artwork"
                      checked={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.checked)}
                    />
                  }
                />
              )}
            </form.Field>
          </Grid.Col>
        </Grid>

        <form.Field name={`decals[${index}].scale`}>
          {(field) => (
            <ControlBlock
              title="Scale"
              description="Resize the decal from 0 (hidden) to 1 (full reference size)."
              tool={
                <NumberInput
                  aria-label={`Scale for alliance decal ${index + 1}`}
                  w={96}
                  min={0}
                  max={1}
                  step={0.01}
                  decimalScale={2}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(value) => {
                    if (typeof value === 'number') field.handleChange(value);
                  }}
                />
              }
              input={
                <Slider
                  aria-label={`Scale slider for alliance decal ${index + 1}`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={field.state.value}
                  label={(value) => value.toFixed(2)}
                  onChange={field.handleChange}
                />
              }
            />
          )}
        </form.Field>

        <Grid>
          <Grid.Col span={{ base: 12, xs: 6 }}>
            <form.Field name={`decals[${index}].offset[0]`}>
              {(field) => (
                <ControlBlock
                  title="Horizontal offset"
                  description="Move left with a negative value or right with a positive value."
                  input={
                    <NumberInput
                      id={`decal-${index}-offset-x`}
                      aria-label="Horizontal offset"
                      step={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(value) => {
                        if (typeof value === 'number') field.handleChange(value);
                      }}
                    />
                  }
                />
              )}
            </form.Field>
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 6 }}>
            <form.Field name={`decals[${index}].offset[1]`}>
              {(field) => (
                <ControlBlock
                  title="Vertical offset"
                  description="Move up with a negative value or down with a positive value."
                  input={
                    <NumberInput
                      id={`decal-${index}-offset-y`}
                      aria-label="Vertical offset"
                      step={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(value) => {
                        if (typeof value === 'number') field.handleChange(value);
                      }}
                    />
                  }
                />
              )}
            </form.Field>
          </Grid.Col>
        </Grid>
      </Stack>
    </Paper>
  );
}

function AllianceCardPreview({ form }: { form: FactionFormApi }) {
  return (
    <form.Subscribe
      selector={(state) => ({
        background: state.values.background,
        decals: state.values.decals,
        logo: state.values.logo,
        text: state.values.rules.alliance.text,
        title: state.values.name,
        troop: state.values.troops[0]?.image,
      })}
    >
      {(preview) => (
        <Stack
          align="center"
          gap="sm"
          pos="sticky"
          top="calc(var(--app-shell-header-offset, 0px) + 6rem)"
        >
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
            Used on: Alliance card
          </Text>
          <Box className={styles.cardFrame} aria-label="Alliance card preview">
            <Box className={styles.cardCanvas}>
              <AllianceCard {...preview} />
            </Box>
          </Box>
          <Text size="xs" c="dimmed" ta="center" maw={240}>
            The preview updates from the ability and every decal control.
          </Text>
        </Stack>
      )}
    </form.Subscribe>
  );
}

export function FactionFormSectionAlliance({
  form,
  showPreview = true,
  selectedDecalIndex,
  onSelectedDecalIndexChange,
}: {
  form: FactionFormApi;
  showPreview?: boolean;
  selectedDecalIndex?: number;
  onSelectedDecalIndexChange?: (index: number) => void;
}) {
  const [internalSelectedDecalIndex, setInternalSelectedDecalIndex] = useState(0);
  const currentSelectedDecalIndex = selectedDecalIndex ?? internalSelectedDecalIndex;
  const selectDecalIndex = onSelectedDecalIndexChange ?? setInternalSelectedDecalIndex;
  return (
    <Stack component="section" gap="md" aria-labelledby="alliance-card-heading">
      <Stack gap={2}>
        <Text id="alliance-card-heading" fw={700} size="lg">
          Alliance card
        </Text>
        <Text c="dimmed" size="sm">
          Author the alliance ability and compose its ordered artwork in one place.
        </Text>
      </Stack>

      <Grid gap="xl" align="start">
        <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
          <Stack gap="lg">
            <form.Field name="rules.alliance.text">
              {(field) => {
                const blank = field.state.value.trim().length === 0;
                return (
                  <Stack gap={4}>
                    <ControlBlock
                      title="Alliance ability"
                      description="Rules text printed on the alliance card. Markdown is supported."
                      input={
                        <Textarea
                          id="rules-alliance"
                          aria-label="Alliance ability"
                          autosize
                          minRows={4}
                          value={field.state.value}
                          aria-describedby={blank ? 'rules-alliance-warning' : undefined}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.currentTarget.value)}
                        />
                      }
                    />
                    {blank ? (
                      <Text id="rules-alliance-warning" c="yellow.9" size="xs" role="status">
                        The alliance ability is empty. This is advisory and does not prevent saving.
                      </Text>
                    ) : null}
                  </Stack>
                );
              }}
            </form.Field>

            <Stack gap="xs">
              <Text fw={700}>Alliance decals</Text>
              <Text c="dimmed" size="sm">
                Layer zero or more decals in order. Drag with a pointer or focus a handle and use
                the keyboard to reorder.
              </Text>
            </Stack>

            <form.Field name="decals" mode="array">
              {(field) => {
                const sortablePrefix = 'decals-';
                const count = field.state.value.length;
                const safeSelectedIndex = Math.min(
                  Math.max(currentSelectedDecalIndex, 0),
                  Math.max(count - 1, 0)
                );
                return (
                  <Stack gap="md">
                    <Group justify="flex-end">
                      <ListLengthActions
                        removeLabel="Remove last alliance decal"
                        addLabel="Add alliance decal"
                        removeDisabled={count === 0}
                        onRemove={() => {
                          const lastIndex = count - 1;
                          if (lastIndex < 0) return;
                          if (currentSelectedDecalIndex >= lastIndex) {
                            selectDecalIndex(Math.max(0, lastIndex - 1));
                          }
                          field.removeValue(lastIndex);
                        }}
                        onAdd={() => {
                          const newIndex = count;
                          field.pushValue(defaultDecal());
                          selectDecalIndex(newIndex);
                        }}
                      />
                    </Group>

                    {count === 0 ? (
                      <Alert color="gray" variant="light" title="No alliance decals">
                        Decals are optional. The alliance card remains valid without decorative
                        artwork.
                      </Alert>
                    ) : null}

                    {count > 0 ? (
                      <>
                        <FactionCollectionShelf
                          label="Ordered alliance decals"
                          sortablePrefix={sortablePrefix}
                          selectedIndex={safeSelectedIndex}
                          onSelectedIndexChange={selectDecalIndex}
                          items={field.state.value.map((decal, index) => ({
                            id: `${sortablePrefix}${index}`,
                            label: decalAssetOptionToLabel(decal.id),
                            description: `Layer ${index + 1}`,
                          }))}
                          onMove={(from, to) =>
                            field.handleChange(arrayMove(field.state.value, from, to))
                          }
                        />
                        <DecalCard form={form} index={safeSelectedIndex} />
                      </>
                    ) : null}
                  </Stack>
                );
              }}
            </form.Field>
          </Stack>
        </Grid.Col>

        {showPreview ? (
          <Grid.Col span={4} visibleFrom="sm">
            <AllianceCardPreview form={form} />
          </Grid.Col>
        ) : null}
      </Grid>
    </Stack>
  );
}
