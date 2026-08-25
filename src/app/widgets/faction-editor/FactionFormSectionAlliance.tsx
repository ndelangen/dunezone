import { Alert, Divider, Grid, Group, Stack, Text } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';

import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { card as CARD_SIZE } from '@game/data/sizes';

import { defaultDecal } from './factionFormDefaults';
import styles from './FactionFormSectionAlliance.module.css';
import type { FactionFormApi } from './factionFormTypes';

/* The offset is unbounded card-space pixels from the card center (card 900 wide, art band 940
   tall). The sliders span half of each dimension, center to edge, while the paired number
   inputs stay unclamped so legacy values beyond the range remain editable. */
const DECAL_OFFSET_RANGE = [450, 470] as const;

/** Binds the shared decal control stack to the faction form's decal at `index`. */
function DecalCard({ form, index }: { form: FactionFormApi; index: number }) {
  const decal = form.state.values.decals[index];
  if (!decal) {
    return null;
  }

  return (
    <form.Field name={`decals[${index}]`}>
      {(field) => (
        <DecalControls
          value={field.state.value}
          onChange={field.handleChange}
          label={`alliance decal ${index + 1}`}
          offsetRange={DECAL_OFFSET_RANGE}
        />
      )}
    </form.Field>
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
        <Stack align="stretch" gap="sm" pos="sticky" top="calc(var(--app-shell-header-offset, 0px) + 6rem)">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
            Used on: Alliance card
          </Text>
          <CanvasScale canvasWidth={CARD_SIZE.width} canvasHeight={CARD_SIZE.height} frameClassName={styles.cardFrame}>
            <AllianceCard {...preview} />
          </CanvasScale>
          <Text size="xs" c="dimmed" ta="center">
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
}: {
  form: FactionFormApi;
  showPreview?: boolean;
}) {
  return (
    <Stack component="section" gap="md" aria-label="Alliance card">
      <Grid gap="xl" align="start">
        <Grid.Col span={{ base: 12, sm: showPreview ? 8 : 12 }}>
          <Stack gap="lg">
            <form.Field name="rules.alliance.text">
              {(field) => {
                const blank = field.state.value.trim().length === 0;
                return (
                  <Stack gap="md">
                    <ControlBlock
                      title="Alliance ability"
                      description="Rules text printed on the alliance card. Use the shared formatted-text syntax."
                      input={
                        <FormattedTextInput
                          id="rules-alliance"
                          aria-label="Alliance ability"
                          autosize
                          minRows={4}
                          value={field.state.value}
                          aria-describedby={blank ? 'rules-alliance-warning' : undefined}
                          onBlur={field.handleBlur}
                          onChange={field.handleChange}
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

            <form.Field name="decals" mode="array">
              {(field) => {
                const count = field.state.value.length;
                return (
                  <Stack gap="md">
                    <Group justify="space-between" align="center">
                      <Text fw={700} size="sm">
                        Decals
                      </Text>
                      <ListLengthActions
                        removeLabel="Remove last alliance decal"
                        addLabel="Add alliance decal"
                        removeDisabled={count === 0}
                        onRemove={() => {
                          if (count > 0) {
                            field.removeValue(count - 1);
                          }
                        }}
                        onAdd={() => field.pushValue(defaultDecal())}
                      />
                    </Group>

                    {count === 0 ? (
                      <Alert color="gray" variant="light" title="No alliance decals">
                        Decals are optional. The alliance card remains valid without them.
                      </Alert>
                    ) : null}

                    {field.state.value.map((_, index) => (
                      <Stack key={index} gap="sm">
                        {index > 0 ? <Divider /> : null}
                        <Text size="sm" fw={600}>
                          Decal {index + 1}
                        </Text>
                        <DecalCard form={form} index={index} />
                      </Stack>
                    ))}
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
