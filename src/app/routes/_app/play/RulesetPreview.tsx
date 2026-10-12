import { Anchor, Group, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { ExternalLink } from 'lucide-react';

import { useRulesetBySlug } from '@db/rulesets';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

import styles from './create.module.css';

/**
 * The chosen ruleset, previewed on the pass: its cover, the start of its About, and the factions it brings to the table.
 * The ruleset's own page opens in a new tab, so the pass keeps everything already set on it.
 */
export function RulesetPreview({ slug }: Readonly<{ slug: string }>) {
  const { data } = useRulesetBySlug(slug);
  if (!data) {
    return null;
  }
  const { ruleset, factions } = data;
  return (
    <section className={styles.preview} aria-label={`About ${ruleset.name}`}>
      <Group wrap="nowrap" align="flex-start" gap="md">
        {ruleset.coverThumbUrl ? <img src={ruleset.coverThumbUrl} alt="" className={styles.previewCover} /> : null}
        <Stack gap="xs" className={styles.previewBody}>
          {ruleset.about.trim() ? (
            <div className={styles.previewAbout}>
              <FormattedTextSource source={ruleset.about} size="sm" />
            </div>
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              Nothing written about this ruleset yet.
            </Text>
          )}
          <Anchor
            size="sm"
            renderRoot={(props) => (
              <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: ruleset.slug }} target="_blank" />
            )}
          >
            <Group gap={4} component="span" wrap="nowrap">
              Read the ruleset
              <ExternalLink size={13} aria-label="opens in a new tab" />
            </Group>
          </Anchor>
        </Stack>
      </Group>
      <Stack gap="xs">
        <Eyebrow>{factions.length === 1 ? '1 faction' : `${factions.length} factions`}</Eyebrow>
        {factions.length > 0 ? (
          <ul className={styles.previewFactions}>
            {factions.map((faction) => (
              <li key={faction._id}>
                <span className={styles.previewToken} aria-hidden>
                  <FactionToken logo={faction.data.logo} background={faction.data.background} />
                </span>
                <Text size="sm" lineClamp={1}>
                  {faction.data.name}
                </Text>
              </li>
            ))}
          </ul>
        ) : (
          <Text size="sm" c="dimmed">
            No factions are linked yet.
          </Text>
        )}
      </Stack>
    </section>
  );
}
