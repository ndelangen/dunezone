import { Text, UnstyledButton } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import type { FactionCatalogueEntry } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

import styles from './FactionList.module.css';

export type FactionListProps = {
  factions: FactionCatalogueEntry[];
  selectedRulesetSlug?: string;
  className?: string;
};

/** Shared responsive faction-card grid used by catalogue and profile detail pages. */
export function FactionList({ factions, selectedRulesetSlug, className }: FactionListProps) {
  if (factions.length === 0) {
    return null;
  }

  return (
    <div className={[styles.grid, className].filter(Boolean).join(' ')}>
      {factions.map((faction) => (
        <FactionCard
          key={faction._id}
          faction={faction}
          selectedRulesetSlug={selectedRulesetSlug}
        />
      ))}
    </div>
  );
}

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
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/factions/$factionId" params={{ factionId: faction.slug }} />
      )}
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
            {leaders.slice(0, 3).map((leader) => (
              <span key={`${leader.name}-${leader.image}`}>
                <LeaderToken {...leader} background={background} logo={logo} />
              </span>
            ))}
          </div>
        </div>
        <div className={styles.caption}>
          <Text className={styles.name} fw={800} size="lg" lineClamp={2}>
            {name}
          </Text>
          {rulesetLabel ? (
            <Text className={styles.ruleset} size="xs" lineClamp={1}>
              {rulesetLabel}
            </Text>
          ) : null}
        </div>
      </BackgroundRenderer>
    </UnstyledButton>
  );
}

export function factionRulesetLabel(
  faction: Pick<FactionCatalogueEntry, 'rulesets'>,
  selectedRulesetSlug?: string
) {
  if (faction.rulesets.length === 0) {
    return null;
  }
  const primary =
    faction.rulesets.find((ruleset) => ruleset.slug === selectedRulesetSlug) ?? faction.rulesets[0];
  if (!primary) {
    return null;
  }
  const additionalCount = faction.rulesets.length - 1;
  return additionalCount > 0 ? `${primary.name} +${additionalCount}` : primary.name;
}
