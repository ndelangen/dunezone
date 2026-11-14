import { Avatar, Text, UnstyledButton } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { effectiveComplexity } from '@ui/content/complexity';
import { ComplexityGlyph } from '@ui/content/ComplexityGlyph';
import { TokenImage } from '@ui/content/TokenImage';
import { RulesetCovers } from '@ui/list/RulesetCovers';
import type { ReactNode } from 'react';

import type { FactionCatalogueEntry } from '@db/factions';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

import styles from './FactionCard.module.css';

/**
 * A faction, as one tile: its artwork, its token, its leaders, its name.
 * The whole tile is a link to the faction.
 *
 * A Block.
 * Callers hand it the faction document;
 * this owns which piece becomes what: the background renders as full-bleed artwork, the Faction leader leads the cast, the first three supporting leaders fan out beside it, the name captions the bottom with the complexity glyph at its right, and the faction's rulesets stand under the name as their covers.
 * The artwork is game-asset content, not a pane treatment;
 * nothing here is a slot.
 */
export function FactionCard({
  faction,
  selectedRulesetSlug,
  action,
  livePreview = false,
}: {
  faction: FactionCatalogueEntry;
  /** The ruleset the list is narrowed to, whose cover leads the card's rulesets. */
  selectedRulesetSlug?: string;
  /** Authoring previews render the current draft instead of its last publication. */
  livePreview?: boolean;
  /**
   * An adornment, not a slot: a control that acts on this faction where it is listed, such as a menu or a remove button.
   * It renders as a sibling of the link rather than inside it, since a button within an anchor is neither valid nor clickable without navigating, and it is positioned top-left because the other three corners carry the faction's own identity: its token, its Faction leader, its supporting leaders and name.
   */
  action?: ReactNode;
}) {
  const { name, emblem, background, factionLeader, leaders } = faction.data;
  const firstColor = background.colors[0];
  const tokenColor = typeof firstColor === 'string' ? firstColor : firstColor.stops[0][0];
  /* The ruleset the list is narrowed to leads; the rest keep the order they came in. */
  const rulesets = faction.rulesets.toSorted(
    (left, right) => Number(right.slug === selectedRulesetSlug) - Number(left.slug === selectedRulesetSlug)
  );

  return (
    /* Exists to position the adornment against the tile; the link keeps its own bounds so its hit area never grows. */
    <div className={styles.root}>
      <UnstyledButton
        className={styles.card}
        renderRoot={(rootProps) => (
          <Link {...rootProps} to="/factions/$factionId" params={{ factionId: faction.slug }} />
        )}
      >
        <BackgroundRenderer background={background} className={styles.artwork}>
          <div className={styles.shade} />
          <div className={styles.factionToken} aria-hidden>
            {livePreview ? (
              <FactionToken emblem={emblem} background={background} />
            ) : (
              <TokenAvatar src={faction.tokenImages?.faction} name={name} color={tokenColor}>
                <svg viewBox="0 0 100 100" className={styles.tokenEmblem}>
                  <use href={`${emblem}#root`} x="15" y="15" width="70" height="70" fill="currentColor" />
                </svg>
              </TokenAvatar>
            )}
          </div>
          {/* The cast stands on the caption: a taller caption lifts the tokens rather than running over them. */}
          <div className={styles.stage}>
            <div className={styles.cast} aria-hidden>
              <div className={styles.factionLeader}>
                {livePreview ? (
                  <LeaderToken {...factionLeader} strength={undefined} background={background} emblem={emblem} />
                ) : (
                  <TokenAvatar
                    src={faction.tokenImages?.members[factionLeader.memberId]}
                    name={factionLeader.name}
                    color={tokenColor}
                  />
                )}
              </div>
              <div className={styles.leaders}>
                {leaders.slice(0, 3).map((leader, index) => (
                  <span key={`${leader.name}-${leader.image}-${index}`}>
                    {livePreview ? (
                      <LeaderToken {...leader} background={background} emblem={emblem} />
                    ) : (
                      <TokenAvatar
                        src={faction.tokenImages?.members[leader.memberId]}
                        name={leader.name}
                        color={tokenColor}
                      />
                    )}
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.caption}>
              <div className={styles.captionText}>
                <Text className={styles.name} fw={800} size="lg" lineClamp={2}>
                  {name}
                </Text>
                <RulesetCovers
                  className={styles.rulesets}
                  rulesets={rulesets}
                  size="var(--ruleset-cover-size)"
                  limit={4}
                />
              </div>
              <ComplexityGlyph score={effectiveComplexity(faction.data.complexity)} />
            </div>
          </div>
        </BackgroundRenderer>
      </UnstyledButton>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

/*
 * One of the card's tokens as a disc.
 * A published token arrives through `TokenImage`, handed to the Avatar as a child so the Avatar's own initials never stand in while it loads.
 * With no publication the Avatar draws the cheap disc: `children` when given, the initials of `name` otherwise, on the faction's colour.
 */
function TokenAvatar({
  src,
  name,
  color,
  children,
}: {
  src: string | undefined;
  name: string;
  color: string;
  children?: ReactNode;
}) {
  return (
    <Avatar
      alt=""
      name={name}
      size="100%"
      radius="50%"
      color={color}
      variant="filled"
      autoContrast
      className={styles.tokenImage}
      classNames={{ placeholder: src ? styles.tokenSlot : styles.tokenPlaceholder }}
    >
      {src ? <TokenImage src={src} name={name} shape="round" /> : children}
    </Avatar>
  );
}
