import { Badge, Group, Slider, Stack, Switch, Text } from '@mantine/core';
import {
  COMPLEXITY_NEAR_CAPACITY,
  calculateComplexity,
  complexityOutOfTen,
  hasAdvisableComplexityDeviation,
} from '@shared/factions/complexity';
import type { FactionInput } from '@shared/factions/schema';
import { complexityTierSliderMarks } from '@ui/content/ComplexityGlyph';

import type { FactionFormApi } from './factionFormTypes';

const TIER_SLIDER_MARKS = complexityTierSliderMarks();

function Advisory({ children }: { children: string }) {
  return (
    <Text c="yellow.9" size="xs" role="status">
      {children} This is advisory and does not prevent saving.
    </Text>
  );
}

function complexityModeDescription({
  active,
  calculated,
  retainedManual,
}: {
  active: boolean;
  calculated: number;
  retainedManual: number | null;
}) {
  const calculated10 = complexityOutOfTen(calculated);
  if (active) {
    return `Rules-text estimate: ${calculated10}/10. Your rating is saved with the faction.`;
  }
  if (retainedManual == null) {
    return `Automatic estimate: ${calculated10}/10. Nothing is stored; the rating tracks your edits.`;
  }
  return `Automatic estimate: ${calculated10}/10. The disabled slider keeps your last manual ${complexityOutOfTen(retainedManual)}/10 rating for when you switch back.`;
}

/**
 * The Complexity chapter: an override-switch over the `complexity` field. The slider is always
 * visible — disabled while the rating is automatic — and keeps its last manual value when the
 * switch turns off, though only an active manual rating is stored (absent field = automatic).
 */
export function FactionFormSectionComplexity({
  form,
  retainedManualRating,
  onRetainedManualRatingChange,
}: {
  form: FactionFormApi;
  /** Raw 0..1 value retained outside this tab so changing chapters cannot discard it. */
  retainedManualRating: number | null;
  onRetainedManualRatingChange: (rating: number) => void;
}) {
  return (
    <form.Subscribe selector={(state: { values: FactionInput }) => state.values.rules}>
      {(rules) => {
        const calculated = calculateComplexity(rules);
        const calc10 = complexityOutOfTen(calculated);
        return (
          <form.Field name="complexity">
            {(field) => {
              const manual = field.state.value;
              const active = manual != null;
              const slider10 = complexityOutOfTen(
                active ? manual : (retainedManualRating ?? calculated)
              );
              const deviates = active && hasAdvisableComplexityDeviation(manual, calculated);

              return (
                <Stack component="section" gap="sm" aria-label="Faction complexity">
                  <Group gap="xs" justify="space-between" wrap="nowrap">
                    <Text c="dimmed" size="sm">
                      How hard this faction is to play, shown in the catalogue and on the faction
                      page. Leave it on automatic to follow your rules text, or set it yourself —
                      you know your table best.
                    </Text>
                    <Badge variant="light" color={active ? 'dune' : 'gray'} size="sm">
                      {active ? 'Manual' : 'Auto'}
                    </Badge>
                  </Group>

                  <Slider
                    min={0}
                    max={10}
                    step={1}
                    value={slider10}
                    onChange={(value) => field.handleChange(value / 10)}
                    onBlur={field.handleBlur}
                    disabled={!active}
                    label={(value) => `${value}/10`}
                    marks={TIER_SLIDER_MARKS}
                    mb="md"
                    thumbLabel="Manual complexity rating"
                  />

                  <Switch
                    size="sm"
                    label="Set the rating manually"
                    checked={active}
                    onChange={(event) => {
                      if (event.currentTarget.checked) {
                        field.handleChange(retainedManualRating ?? calculated);
                        return;
                      }
                      onRetainedManualRatingChange(manual ?? calculated);
                      field.handleChange(undefined);
                    }}
                  />

                  <Text size="xs" c="dimmed">
                    {complexityModeDescription({
                      active,
                      calculated,
                      retainedManual: retainedManualRating,
                    })}
                  </Text>

                  {deviates ? (
                    <Advisory>
                      {`Your rating (${complexityOutOfTen(manual)}/10) sits far from the rules-text estimate (${calc10}/10). That can be right — word count is only a rough signal, and you know your table best — but a large gap is worth a second look.`}
                    </Advisory>
                  ) : null}
                  {calculated >= COMPLEXITY_NEAR_CAPACITY ? (
                    <Advisory>
                      The rules text is approaching the printed sheet&rsquo;s capacity — consider
                      trimming so it stays readable at the table.
                    </Advisory>
                  ) : null}
                </Stack>
              );
            }}
          </form.Field>
        );
      }}
    </form.Subscribe>
  );
}
