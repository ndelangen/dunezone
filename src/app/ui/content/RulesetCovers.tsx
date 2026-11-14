import { Avatar, Tooltip } from '@mantine/core';

import { NameDisc, nameDiscColor } from './NameDisc';

/* A count reads at two fifths of its disc, as an initial does, and never smaller than NameDisc's own floor. */
const MIN_COUNT_PX = 9;

/**
 * The covers of the rulesets something is in, overlapping, each named on hover.
 *
 * Content.
 * They are pictures and not links, because what they sit in is already the link.
 * A ruleset without a cover shows its initial on its name's own colour, and no ruleset at all shows nothing.
 * With a `limit`, one ruleset more than it turns the last place into a count of the rest, named on hover.
 * The caller orders the rulesets and may place the row through `className`.
 */
export function RulesetCovers({
  rulesets,
  size,
  limit,
  className,
}: Readonly<{
  rulesets: readonly { id: string; name: string; coverThumbUrl: string | null }[];
  /** A cover's diameter, in pixels or as any CSS length, a custom property among them. */
  size: number | `${number}${string}` | `var(${string})`;
  /** How many places the row has; left out, every ruleset shows. */
  limit?: number;
  className?: string;
}>) {
  if (rulesets.length === 0) {
    return null;
  }
  const length = typeof size === 'number' ? `${size}px` : size;
  const shown = rulesets.slice(0, limit !== undefined && rulesets.length > limit ? limit - 1 : rulesets.length);
  const rest = rulesets.slice(shown.length);
  return (
    <Avatar.Group
      role="group"
      spacing={6}
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
          {/* Filled from the text's own colour, so the count shows on a pane and on a card's artwork alike. */}
          <Avatar
            size={length}
            radius="50%"
            styles={{
              placeholder: {
                color: 'inherit',
                background: 'color-mix(in srgb, currentColor 22%, transparent)',
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
