import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

import { EntityLink } from './EntityLink';
import type { EntityLinkProps } from './EntityLink';
import styles from './EntityLink.module.css';

export interface RulesetLinkProps {
  slug: string;
  name: string;
  /** The ruleset's cover, the family's `image`. Omit it where a projection carries no cover and the glyph stands in. */
  image?: string | null;
  className?: string;
  style?: CSSProperties;
}

/**
 * A ruleset, as a link: its cover and its name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the ruleset kind.
 * Callers hand it the fields;
 * this owns how a ruleset is cited inline anywhere in the app, so every mention looks and navigates identically.
 * A caller whose projection carries no cover gets the shared glyph instead, which is why the cover is optional rather than required.
 * The destination is hardcoded because it is the component's name.
 */
export const RulesetLink = ({ slug, name, image = null, className, style }: RulesetLinkProps) => {
  const renderRoot: EntityLinkProps['renderRoot'] = (props) => (
    <Link to="/rulesets/$rulesetSlug" params={{ rulesetSlug: slug }} {...props} />
  );
  return image ? (
    <EntityLink
      name={name}
      disc={<img src={image} alt="" className={styles.cover} />}
      className={className}
      style={style}
      renderRoot={renderRoot}
    />
  ) : (
    <EntityLink name={name} glyph="rulesets" className={className} style={style} renderRoot={renderRoot} />
  );
};
