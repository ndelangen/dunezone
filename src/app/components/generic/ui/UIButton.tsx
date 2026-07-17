import { Link, type LinkComponentProps } from '@tanstack/react-router';
import clsx from 'clsx';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import styles from './UIButton.module.css';

export type UIButtonVariant = 'nav' | 'secondary' | 'confirm' | 'critical';

type UIButtonShared = {
  variant?: UIButtonVariant;
  className?: string;
  children?: ReactNode;
  /** Square icon-sized hit target when true. */
  iconOnly?: boolean;
};

type UIButtonAsLink = UIButtonShared &
  LinkComponentProps & {
    href?: undefined;
  };

type UIButtonAsAnchor = UIButtonShared &
  ComponentPropsWithoutRef<'a'> & {
    href: string;
    to?: undefined;
  };

export type UIButtonAsButton = UIButtonShared &
  ComponentPropsWithoutRef<'button'> & {
    to?: undefined;
    href?: undefined;
  };

export type UIButtonProps = UIButtonAsLink | UIButtonAsAnchor | UIButtonAsButton;

export type UIButtonLinkProps = Omit<UIButtonAsLink, 'children'> & {
  children: ReactNode;
};

function uiButtonClassNames(variant: UIButtonVariant, iconOnly: boolean): string {
  const pieces: string[] = [styles.button];
  if (iconOnly) pieces.push(styles.buttonIconOnly);
  switch (variant) {
    case 'nav':
      return clsx(...pieces, styles.nav);
    case 'secondary':
      return clsx(...pieces, styles.buttonSecondary, styles.linkPlain);
    case 'critical':
      return clsx(...pieces, styles.buttonDanger, styles.linkPlain);
    default:
      return clsx(...pieces, styles.linkPlain);
  }
}

/**
 * Shared button chrome with semantic variants and optional icon-only layout.
 * Uses a native anchor for `href`, a TanStack Router `Link` for `to`, and a
 * button otherwise.
 */
export function UIButton({
  variant = 'confirm',
  className,
  children,
  iconOnly = true,
  ...rest
}: UIButtonProps) {
  const cn = clsx(uiButtonClassNames(variant, iconOnly), className);

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorProps } = rest as Omit<
      UIButtonAsAnchor,
      'variant' | 'className' | 'children' | 'iconOnly'
    >;
    return (
      <a {...anchorProps} href={href} className={cn}>
        {children}
      </a>
    );
  }

  if ('to' in rest && rest.to !== undefined) {
    const { to, ...linkProps } = rest as Omit<
      UIButtonAsLink,
      'variant' | 'className' | 'children' | 'iconOnly'
    >;
    return (
      <Link {...linkProps} to={to} className={cn}>
        {children}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = rest as Omit<
    UIButtonAsButton,
    'variant' | 'className' | 'children' | 'iconOnly'
  >;
  return (
    <button type={type} {...buttonProps} className={cn}>
      {children}
    </button>
  );
}

export function UIButtonLink(props: UIButtonLinkProps) {
  return <UIButton {...props} />;
}
