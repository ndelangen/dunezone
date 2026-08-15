import { Tooltip } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { FaRedditAlien } from 'react-icons/fa6';
import { SiBoardgamegeek, SiDiscord, SiGithub, SiStorybook } from 'react-icons/si';

import styles from './AppFooter.module.css';
import { setMotionOverride, useMotionAllowed } from './motion';

/* `to` marks a routed page; `href` is a destination outside the router — the static Storybook
   build, or an external site (opened in a new tab). */
const footerLinks = [
  { href: '/__storybook/', icon: SiStorybook, label: 'Component library' },
  { href: 'https://github.com/ndelangen/dunezone', icon: SiGithub, label: 'Source code' },
  { to: '/privacy', icon: ShieldCheck, label: 'Privacy policy' },
  {
    href: 'https://discord.com/invite/dune-tabletop-624609341886169117',
    icon: SiDiscord,
    label: 'Dune Discord server',
  },
  {
    href: 'https://www.reddit.com/r/DuneBoardGame/',
    icon: FaRedditAlien,
    label: 'r/DuneBoardGame on Reddit',
  },
  {
    href: 'https://boardgamegeek.com/boardgame/283355/dune/forums/69',
    icon: SiBoardgamegeek,
    label: 'Dune forums on BoardGameGeek',
  },
] as const;

/**
 * Public waypoints to the project's component catalogue, source, policies, and community homes —
 * and the switch that overrides the OS's reduced-motion hint for this site (see `motion.ts`). The
 * waypoints are icon-only circles; one `label` per entry fans out to the accessible name and the
 * `Tooltip`, so the two cannot come apart. The switch stays a bare checkbox: it is bespoke footer
 * chrome, styled with the band rather than the content theme.
 */
export function AppFooter() {
  const motion = useMotionAllowed();

  return (
    <div className={styles.waypoints}>
      <p className={styles.eyebrow}>Continue exploring</p>
      <nav aria-label="Footer">
        {footerLinks.map((entry) => {
          const { icon: Icon, label } = entry;
          const glyph = <Icon aria-hidden size={20} strokeWidth={1.8} />;

          return (
            <Tooltip key={label} label={label}>
              {'to' in entry ? (
                <Link aria-label={label} className={styles.waypointLink} to={entry.to}>
                  {glyph}
                </Link>
              ) : (
                <a
                  aria-label={label}
                  className={styles.waypointLink}
                  href={entry.href}
                  {...(entry.href.startsWith('https://')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : undefined)}
                >
                  {glyph}
                </a>
              )}
            </Tooltip>
          );
        })}
      </nav>
      <label aria-label="Ambient motion" className={styles.motionToggle}>
        <input
          checked={motion}
          className={styles.motionInput}
          onChange={(event) => setMotionOverride(event.currentTarget.checked ? 'on' : 'off')}
          type="checkbox"
        />
        <span aria-hidden className={styles.motionTrack} />
        <span className={styles.linkCopy}>
          <strong>Ambient motion</strong>
          <small>The masthead video and the turning dice</small>
        </span>
      </label>
    </div>
  );
}
