import { Avatar, Tooltip } from '@mantine/core';

import { NameDisc, nameDiscColor } from '../content/NameDisc';

/* A count reads at two fifths of its disc, as an initial does, and never smaller than NameDisc's own floor. */
const MIN_COUNT_PX = 9;

/**
 * The covers of the rulesets something is in, overlapping, each named on hover.
 *
 * A List.
 * Callers own the rulesets, their order and where the row sits;
 * this component owns the row: the discs' overlap, the initial that stands in for a missing cover, and the count that stands in for the rulesets past `limit`.
 * The covers are pictures and not links, because what they sit in is already the link, and no ruleset at all renders nothing.
 */
export function RulesetCovers({
  rulesets,
  size,
  limit,
  className,
}: Readonly<{
  /** The rulesets, in the order their covers stand. */
  rulesets: readonly { id: string; name: string; coverThumbUrl: string | null }[];
  /** A cover's diameter, in pixels or as any CSS length, a custom property among them. */
  size: number | `${number}${string}` | `var(${string})`;
  /** How many places the row has, one at least: a ruleset more than that turns the last place into a count of the rest. Left out, every ruleset shows. */
  limit?: number;
  className?: string;
}>) {
  if (rulesets.length === 0) {
    return null;
  }
  const length = typeof size === 'number' ? `${size}px` : size;
  const places = limit === undefined ? rulesets.length : Math.max(1, limit);
  const shown = rulesets.slice(0, rulesets.length > places ? places - 1 : rulesets.length);
  const rest = rulesets.slice(shown.length);
  return (
    <Avatar.Group
      role="group"
      spacing="xs"
      className={className}
      aria-label={`Rulesets: ${rulesets.map((ruleset) => ruleset.name).join(', ')}`}
    >
      {shown.map((ruleset) => (
        <Tooltip key={ruleset.id} label={ruleset.name} withArrow>
          <NameDisc
            src={ruleset.coverThumbUrl}
            name={ruleset.name}
            label={ruleset.name}
            size={size}
            color={ruleset.coverThumbUrl ? undefined : nameDiscColor(ruleset.name)}
          />
        </Tooltip>
      ))}
      {rest.length > 0 ? (
        <Tooltip label={rest.map((ruleset) => ruleset.name).join(', ')} withArrow>
          {/*
           * A ring and the count, with no fill: only a Surface paints, and a ring in the text's own colour shows on a pane and on a card's artwork alike.
           * It stands beside the last cover rather than over it, since nothing of its own would hide what it overlapped.
           */}
          <Avatar
            size={length}
            radius="50%"
            styles={{
              root: {
                marginInlineStart: 0,
                background: 'none',
                border: '1px solid color-mix(in srgb, currentColor 45%, transparent)',
              },
              placeholder: {
                color: 'inherit',
                background: 'none',
                fontSize: `max(${MIN_COUNT_PX}px, calc(${length} * 0.4))`,
                fontWeight: 600,
              },
            }}
          >
            +{rest.length}
          </Avatar>
        </Tooltip>
      ) : null}
    </Avatar.Group>
  );
}
