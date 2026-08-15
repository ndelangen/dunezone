import { Popover, Progress, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { COMPLEXITY_TIER_PRESENTATION } from '@ui/content/ComplexityGlyph';
import { TopicIcon } from '@ui/content/TopicIcon';

import {
  COMPLEXITY_DEVIATION_THRESHOLD,
  COMPLEXITY_NEAR_CAPACITY,
  calculateComplexity,
  complexityOutOfTen,
  complexityTier,
} from '@shared/factions/complexity';
import type { FactionInput } from '@shared/factions/schema';

import styles from './FactionComplexityIndicator.module.css';
import type { FactionFormApi } from './factionFormTypes';

const DONUT_SIZE = 34;
const DONUT_STROKE = 3;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/** The tier glyph inside a progress ring: empty at 0, a full circle at 1, animated between. */
function DonutGlyph({ score }: { score: number }) {
  const tier = complexityTier(score);
  return (
    <span className={styles.donut}>
      <svg
        width={DONUT_SIZE}
        height={DONUT_SIZE}
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        aria-hidden
        className={styles.donutRing}
      >
        <circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={DONUT_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={DONUT_STROKE}
        />
        <circle
          className={styles.donutFill}
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={DONUT_RADIUS}
          fill="none"
          strokeWidth={DONUT_STROKE}
          strokeLinecap="round"
          strokeDasharray={DONUT_CIRCUMFERENCE}
          strokeDashoffset={DONUT_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, score)))}
        />
      </svg>
      <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION[tier].icon} size={16} />
    </span>
  );
}

/**
 * The authoring toolbar's live complexity indicator. It always presents the rules-text estimate —
 * never the author's manual rating — so it keeps moving as the rules are written; the popover
 * carries the summary and the advisories.
 */
export function FactionComplexityIndicator({ form }: { form: FactionFormApi }) {
  return (
    <form.Subscribe
      selector={(state: { values: FactionInput }) => ({
        rules: state.values.rules,
        manual: state.values.complexity,
      })}
    >
      {({ rules, manual }) => {
        const calculated = calculateComplexity(rules);
        const calc10 = complexityOutOfTen(calculated);
        const tier = complexityTier(calculated);
        const deviates =
          manual != null && Math.abs(manual - calculated) >= COMPLEXITY_DEVIATION_THRESHOLD;

        return (
          <Popover position="bottom-end" shadow="md" width={300}>
            <Popover.Target>
              <Tooltip label={`Complexity ${calc10}/10 · ${COMPLEXITY_TIER_PRESENTATION[tier].label}`}>
                <UnstyledButton
                  aria-label={`Faction complexity: ${calc10} out of 10`}
                  className={styles.trigger}
                >
                  <DonutGlyph score={calculated} />
                </UnstyledButton>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown className={styles.pane}>
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
                    Your manual rating ({complexityOutOfTen(manual ?? 0)}/10) sits far from this
                    estimate. This is advisory and does not prevent saving.
                  </Text>
                ) : null}
                {calculated >= COMPLEXITY_NEAR_CAPACITY ? (
                  <Text c="yellow.9" size="xs" role="status">
                    The rules text is approaching the printed sheet&rsquo;s capacity — consider
                    trimming. This is advisory and does not prevent saving.
                  </Text>
                ) : null}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        );
      }}
    </form.Subscribe>
  );
}
