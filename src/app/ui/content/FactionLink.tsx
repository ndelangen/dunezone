import { Link } from '@tanstack/react-router';
import type { ComponentProps, CSSProperties } from 'react';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import { EntityLink } from './EntityLink';

type FactionTokenProps = ComponentProps<typeof FactionToken>;

export interface FactionLinkProps {
  slug: string;
  name: string;
  /** The faction's own mark, the same pair its detail page renders. */
  emblem: FactionTokenProps['emblem'];
  background: FactionTokenProps['background'];
  className?: string;
  style?: CSSProperties;
}

/**
 * A faction, as a link: its own symbol and its name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the faction kind.
 * Callers hand it the fields;
 * this owns how a faction is cited inline anywhere in the app, so every mention looks and navigates identically.
 * The destination is hardcoded because it is the component's name.
 */
export const FactionLink = ({ slug, name, emblem, background, className, style }: FactionLinkProps) => (
  <EntityLink
    name={name}
    disc={<FactionToken emblem={emblem} background={background} />}
    className={className}
    style={style}
    renderRoot={(props) => <Link to="/factions/$factionId" params={{ factionId: slug }} {...props} />}
  />
);
