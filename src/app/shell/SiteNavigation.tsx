import { useAuthActions } from '@convex-dev/auth/react';
import { Menu } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { LinkProps } from '@tanstack/react-router';
import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { profileAvatarUrl, useCurrentProfile } from '@db/profiles';

import styles from './SiteNavigation.module.css';

export interface NavLinkItem {
  label: string;
  to: LinkProps['to'];
}

/* The link set is content, not structure: the system renders whatever list it is given, at any
   count and any label length, so editing this array is the whole job of changing the navigation. */
const PRIMARY_LINKS: readonly NavLinkItem[] = [
  { label: 'Factions', to: '/factions' },
  { label: 'Rulesets', to: '/rulesets' },
  { label: 'Profiles', to: '/profiles' },
  { label: 'Assets', to: '/assets' },
];

/* Room reserved for the More control before deciding which links fit. It cannot be measured
   (the control only exists once something overflows), so this over-reserves slightly, which also
   covers the one width the measure row cannot know: the active link's 600 weight. */
const MORE_RESERVE_PX = 90;

/* Mirrors `.popover`'s max-width; the clamp keeps that widest panel inside the viewport. */
export interface SiteNavigationProps {
  /** The destinations to offer. Defaults to the product's primary set. */
  links?: readonly NavLinkItem[];
}

/**
 * Product navigation, including its profile-aware account slot.
 *
 * The row is priority-plus: links that fit stay visible, the rest collapse behind a More control, re-measured through a
 * `ResizeObserver` against a hidden copy of the full list, so the row is correct for any link count, any label length, at any width, without a breakpoint.
 * At phone widths it collapses down to the More control.
 *
 * Both popovers (More, and the signed-in account menu) render through a portal: the band that hosts this nav is
 * `overflow: hidden` for its rounded corners, so anything positioned inside it clips at the band's lower edge, which at compact band heights swallows the panel entirely.
 */
export function SiteNavigation({ links = PRIMARY_LINKS }: SiteNavigationProps) {
  const profile = useCurrentProfile();
  const { signOut } = useAuthActions();
  const groupRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const visibleCount = useVisibleLinkCount(groupRef, measureRef, links);

  const overflow = links.slice(visibleCount);
  /* Captured so the menu's `renderRoot` callbacks keep the narrowing that a property access would lose inside them. */
  const account = profile.data;
  const accountAvatarUrl = account ? profileAvatarUrl(account) : null;

  return (
    <nav className={styles.root} aria-label="Primary navigation">
      <Link to="/" className={styles.logo} aria-label="Dune home">
        <img className={styles.logoImage} src="/web/logo.svg" alt="" />
      </Link>
      <div className={styles.linkGroup} ref={groupRef}>
        <div className={styles.linkRow}>
          <div className={styles.measureRow} ref={measureRef} aria-hidden>
            {links.map((item) => (
              <span key={item.label}>{item.label}</span>
            ))}
          </div>
          {links.slice(0, visibleCount).map((item) => (
            <Link key={item.label} to={item.to} activeProps={{ className: styles.activeLink }}>
              {item.label}
            </Link>
          ))}
        </div>
        {overflow.length > 0 && (
          /*
            The same Mantine Menu the avatar wears, which settled the destinations question by shipping:
            that menu is destination-majority and merged as #452. Menu owns opening, focus, dismissal and
            the target's aria state, so the hand-rolled anchor, portal and position math all retire (#453).
          */
          <Menu position="bottom-start" shadow="md" withinPortal>
            <Menu.Target>
              <button type="button" className={styles.moreButton}>
                More <span aria-hidden>▾</span>
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              {overflow.map((item) => (
                <Menu.Item
                  key={item.label}
                  renderRoot={(rootProps) => (
                    <Link {...rootProps} to={item.to} activeProps={{ className: styles.activeLink }} />
                  )}
                >
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>
      <div className={styles.account}>
        {account ? (
          <>
            {/*
              Mantine's `Menu`, whose dropdown takes the app's pane treatment from the theme (the same one a
              `Popover` gets). It is the same menu the faction cards use. It owns opening, focus, dismissal and the
              target's aria state, so this holds no anchor of its own and no item has to close it by hand.
            */}
            <Menu position="bottom-end" shadow="md" withinPortal>
              <Menu.Target>
                <button type="button" className={styles.avatarButton} aria-label={account.username ?? 'Account'}>
                  {accountAvatarUrl ? (
                    <img src={accountAvatarUrl} alt="" className={styles.avatarImage} />
                  ) : (
                    <span className={styles.avatarInitials}>{account.username?.slice(0, 2).toUpperCase() ?? '??'}</span>
                  )}
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  renderRoot={(rootProps) => (
                    <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: account.slug }} />
                  )}
                >
                  Your profile
                </Menu.Item>
                <Menu.Item
                  renderRoot={(rootProps) => (
                    <Link {...rootProps} to="/profiles/$profileSlug/edit" params={{ profileSlug: account.slug }} />
                  )}
                >
                  Edit profile
                </Menu.Item>
                <Menu.Item onClick={() => void signOut()}>Sign out</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        ) : (
          <Link to="/auth/login" activeProps={{ className: styles.activeLink }}>
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}

/**
 * How many leading links fit the group's width.
 * The hidden measure row renders every label with the row's own text styles, so each label's true width is read rather than estimated;
 * when the full list fits nothing is reserved, otherwise the More control's reserve is subtracted first.
 */
function useVisibleLinkCount(
  groupRef: RefObject<HTMLDivElement | null>,
  measureRef: RefObject<HTMLDivElement | null>,
  links: readonly NavLinkItem[]
) {
  const [visibleCount, setVisibleCount] = useState(links.length);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const measure = measureRef.current;
    if (!group || !measure) {
      return;
    }

    const compute = () => {
      // Read the gap the row actually renders with, so the math can never drift from the CSS.
      const gap = Number.parseFloat(getComputedStyle(measure).gap) || 0;
      const widths = Array.from(measure.children).map((child) => (child as HTMLElement).offsetWidth + gap);
      const total = widths.reduce((sum, width) => sum + width, 0);
      // A fitting row renders one fewer gap than the per-item sum counts.
      if (total - gap <= group.clientWidth) {
        setVisibleCount(widths.length);
        return;
      }
      const available = group.clientWidth - MORE_RESERVE_PX;
      let used = 0;
      let fit = 0;
      for (const width of widths) {
        used += width;
        if (used > available) {
          break;
        }
        fit++;
      }
      setVisibleCount(fit);
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(group);
    /* The measure row shrink-wraps its labels, so it also resizes when the webfont swaps in,
       the one width change the group (viewport-sized) never reports. */
    observer.observe(measure);
    return () => observer.disconnect();
  }, [groupRef, measureRef, links]);

  return Math.min(visibleCount, links.length);
}
