import { Badge, Group, Slider, Stack, Switch, Text } from '@mantine/core';
import { COMPLEXITY_TIER_PRESENTATION } from '@ui/content/ComplexityGlyph';
import { TopicIcon } from '@ui/content/TopicIcon';
import { useState } from 'react';

import {
  COMPLEXITY_DEVIATION_THRESHOLD,
  COMPLEXITY_NEAR_CAPACITY,
  calculateComplexity,
  complexityOutOfTen,
} from '@shared/factions/complexity';
import type { FactionInput } from '@shared/factions/schema';

import type { FactionFormApi } from './factionFormTypes';

/** The x/10 slider positions where each tier's glyph marks the track. */
const TIER_SLIDER_MARKS = [
  { value: 1, label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.novice.icon} size={12} /> },
  {
    value: 4,
    label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.intermediate.icon} size={12} />,
  },
  { value: 6, label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.expert.icon} size={12} /> },
  { value: 9, label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.master.icon} size={12} /> },
];

function Advisory({ children, id }: { children: string; id: string }) {
  return (
    <Text id={id} c="yellow.9" size="xs" role="status">
      {children} This is advisory and does not prevent saving.
    </Text>
  );
}

/**
 * The Complexity chapter: an override-switch over the `complexity` field. The slider is always
 * visible — disabled while the rating is automatic — and keeps its last manual value when the
 * switch turns off, though only an active manual rating is stored (absent field = automatic).
 */
export function FactionFormSectionComplexity({ form }: { form: FactionFormApi }) {
  /* The value the disabled slider holds onto after the author switches back to automatic. */
  const [retained, setRetained] = useState<number | null>(null);

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
              const slider10 = active
                ? complexityOutOfTen(manual)
                : (retained ?? calc10);
              const deviates =
                active && Math.abs(manual - calculated) >= COMPLEXITY_DEVIATION_THRESHOLD;

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
                    aria-label="Manual complexity rating"
                  />

                  <Switch
                    size="sm"
                    label="Set the rating manually"
                    checked={active}
                    onChange={(event) => {
                      if (event.currentTarget.checked) {
                        field.handleChange((retained ?? calc10) / 10);
                        return;
                      }
                      setRetained(complexityOutOfTen(manual ?? calculated));
                      field.handleChange(undefined);
                    }}
                  />

                  <Text size="xs" c="dimmed">
                    {active
                      ? `Rules-text estimate: ${calc10}/10. Your rating is saved with the faction.`
                      : 'Automatic — following your rules text. Nothing is stored; the rating tracks your edits.'}
                  </Text>

                  {deviates ? (
                    <Advisory id="complexity-deviation-advisory">
                      {`Your rating (${complexityOutOfTen(manual)}/10) sits far from the rules-text estimate (${calc10}/10). That can be right — word count is only a rough signal, and you know your table best — but a large gap is worth a second look.`}
                    </Advisory>
                  ) : null}
                  {calculated >= COMPLEXITY_NEAR_CAPACITY ? (
                    <Advisory id="complexity-capacity-advisory">
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
