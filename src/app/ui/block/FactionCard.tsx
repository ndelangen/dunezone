import { Text, UnstyledButton } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { effectiveComplexity } from '@ui/content/complexity';
import { ComplexityGlyph } from '@ui/content/ComplexityGlyph';

import type { FactionCatalogueEntry } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

import styles from './FactionCard.module.css';

/**
 * A faction, as one tile: its artwork, its token, its leaders, its name. The whole tile is a link to the faction.
 *
 * A Block — callers hand it the faction document and this owns which piece becomes what: the background renders as
 * full-bleed artwork, the hero leads the cast, the first three leaders fan out beside it, the name captions the bottom
 * with the complexity glyph at its right. The artwork is game-asset content, not a pane treatment; nothing here is a
 * slot.
 */
export function FactionCard({
  faction,
  selectedRulesetSlug,
}: {
  faction: FactionCatalogueEntry;
  selectedRulesetSlug?: string;
}) {
  const { name, logo, background, hero, leaders } = faction.data;
  const rulesetLabel = factionRulesetLabel(faction, selectedRulesetSlug);

  return (
    <UnstyledButton
      className={styles.card}
      renderRoot={(rootProps) => <Link {...rootProps} to="/factions/$factionId" params={{ factionId: faction.slug }} />}
    >
      <BackgroundRenderer background={background} className={styles.artwork}>
        <div className={styles.shade} />
        <div className={styles.factionToken} aria-hidden>
          <FactionToken logo={logo} background={background} />
        </div>
        <div className={styles.cast} aria-hidden>
          <div className={styles.hero}>
            <LeaderToken {...hero} strength={undefined} background={background} logo={logo} />
          </div>
          <div className={styles.leaders}>
            {leaders.slice(0, 3).map((leader, index) => (
              <span key={`${leader.name}-${leader.image}-${index}`}>
                <LeaderToken {...leader} background={background} logo={logo} />
              </span>
            ))}
          </div>
        </div>
        <div className={styles.caption}>
          <div className={styles.captionText}>
            <Text className={styles.name} fw={800} size="lg" lineClamp={2}>
              {name}
            </Text>
            {rulesetLabel ? (
              <Text className={styles.ruleset} size="xs" lineClamp={1}>
                {rulesetLabel}
              </Text>
            ) : null}
          </div>
          <ComplexityGlyph score={effectiveComplexity(faction.data.complexity)} />
        </div>
      </BackgroundRenderer>
    </UnstyledButton>
  );
}

/** The card's ruleset caption: the selected ruleset when the faction is in it, else its first. */
export function factionRulesetLabel(faction: Pick<FactionCatalogueEntry, 'rulesets'>, selectedRulesetSlug?: string) {
  if (faction.rulesets.length === 0) {
    return null;
  }
  const primary = faction.rulesets.find((ruleset) => ruleset.slug === selectedRulesetSlug) ?? faction.rulesets[0];
  if (!primary) {
    return null;
  }
  const additionalCount = faction.rulesets.length - 1;
  return additionalCount > 0 ? `${primary.name} +${additionalCount}` : primary.name;
}
