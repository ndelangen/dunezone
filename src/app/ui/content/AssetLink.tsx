import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

import { EntityLink } from './EntityLink';

export interface AssetLinkProps {
  /** The asset's type slug, a route param. Plain string because the page contracts carry it that way. */
  type: string;
  slug: string;
  name: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * An asset, as a link: its glyph and name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the asset kind.
 * Callers hand it the fields;
 * this owns how an asset is cited inline anywhere in the app, so every mention looks and navigates identically.
 * The destination is hardcoded because it is the component's name.
 */
export const AssetLink = ({ type, slug, name, className, style }: AssetLinkProps) => (
  <EntityLink
    name={name}
    glyph="assets"
    className={className}
    style={style}
    renderRoot={(props) => <Link to="/assets/$type/$slug" params={{ type, slug }} {...props} />}
  />
);
