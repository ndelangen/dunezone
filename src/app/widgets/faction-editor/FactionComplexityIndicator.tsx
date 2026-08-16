import { Popover, Progress, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { FactionInput } from '@shared/factions/schema';
import { complexityEditorPresentation, complexityOutOfTen } from '@ui/content/complexity';
import { COMPLEXITY_TIER_PRESENTATION, ComplexityGlyph } from '@ui/content/ComplexityGlyph';
import { Surface } from '@ui/surface';

import styles from './FactionComplexityIndicator.module.css';
import type { FactionFormApi } from './factionFormTypes';

/**
 * The authoring toolbar's live complexity indicator.
 * It always presents the rules-text estimate — never the author's manual rating — so it keeps moving as the rules are written; the popover carries the summary and the advisories.
 */
export function FactionComplexityIndicator({ form }: { form: FactionFormApi }) {
  return (
    <form.Subscribe
      selector={(state: { values: FactionInput }) => ({
        rules: state.values.rules,
        manual: state.values.complexity.manual,
      })}
    >
      {({ rules, manual }) => {
        const {
          calculated,
          calculatedOutOfTen: calc10,
          tier,
          deviates,
          nearCapacity,
        } = complexityEditorPresentation(rules, manual);

        return (
          <Popover position="bottom-end" width={300}>
            <Popover.Target>
              <Tooltip label={`Complexity ${calc10}/10 · ${COMPLEXITY_TIER_PRESENTATION[tier].label}`}>
                <UnstyledButton aria-label={`Faction complexity: ${calc10} out of 10`} className={styles.trigger}>
                  <ComplexityGlyph score={calculated} size={16} progressRing decorative />
                </UnstyledButton>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown style={{ padding: 0, border: 0, boxShadow: 'none' }} bg="transparent">
              <Surface padding="md">
                <Stack gap="sm">
                  <Text size="sm" fw={700}>
                    {COMPLEXITY_TIER_PRESENTATION[tier].label}{' '}
                    <Text span size="sm" c="dimmed">
                      {calc10}/10
                    </Text>
                  </Text>
                  <Progress value={calculated * 100} size="sm" aria-hidden />
                  <Text size="xs" c="dimmed">
                    {COMPLEXITY_TIER_PRESENTATION[tier].blurb}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Estimated live from the rules text. Set your own rating in the Complexity tab.
                  </Text>
                  {deviates ? (
                    <Text c="yellow.9" size="xs" role="status">
                      Your manual rating ({complexityOutOfTen(manual ?? 0)}/10) sits far from this estimate. This is
                      advisory and does not prevent saving.
                    </Text>
                  ) : null}
                  {nearCapacity ? (
                    <Text c="yellow.9" size="xs" role="status">
                      The rules text is approaching the printed sheet&rsquo;s capacity — consider trimming. This is
                      advisory and does not prevent saving.
                    </Text>
                  ) : null}
                </Stack>
              </Surface>
            </Popover.Dropdown>
          </Popover>
        );
      }}
    </form.Subscribe>
  );
}
