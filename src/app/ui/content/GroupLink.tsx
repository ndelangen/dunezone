import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

import { EntityLink } from './EntityLink';
import { nameDiscColor } from './nameDisc';

export interface GroupLinkProps {
  slug: string;
  name: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A group, as a link: a disc in its own colour and its name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the group kind.
 * A colour disc rather than a picture because the groups table carries no image;
 * the colour comes from the name, so the same group is the same colour everywhere.
 * Callers hand it the fields;
 * this owns how a group is cited inline anywhere in the app, so every mention looks and navigates identically.
 * The destination is hardcoded because it is the component's name.
 */
export const GroupLink = ({ slug, name, className, style }: GroupLinkProps) => (
  <EntityLink
    name={name}
    disc={null}
    color={nameDiscColor(name)}
    className={className}
    style={style}
    renderRoot={(props) => <Link to="/groups/$groupSlug" params={{ groupSlug: slug }} {...props} />}
  />
);
