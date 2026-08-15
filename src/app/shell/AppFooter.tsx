import { ShieldCheck } from 'lucide-react';
import { SiBoardgamegeek, SiDiscord, SiGithub, SiReddit, SiStorybook } from 'react-icons/si';

import styles from './AppFooter.module.css';
import { setMotionOverride, useMotionAllowed } from './motion';

const footerLinks = [
  {
    href: '/__storybook/',
    icon: SiStorybook,
    label: 'Component library',
    note: 'Explore the interface',
  },
  {
    href: 'https://github.com/ndelangen/dunezone',
    icon: SiGithub,
    label: 'Source code',
    note: 'Built in the open',
  },
  {
    href: '/privacy',
    icon: ShieldCheck,
    label: 'Privacy policy',
    note: 'How data is handled',
  },
  {
    href: 'https://discord.com/invite/dune-tabletop-624609341886169117',
    icon: SiDiscord,
    label: 'Discord',
    note: 'Join the conversation',
  },
  {
    href: 'https://www.reddit.com/r/DuneBoardGame/',
    icon: SiReddit,
    label: 'Reddit',
    note: 'r/DuneBoardGame',
  },
  {
    href: 'https://boardgamegeek.com/boardgame/283355/dune/forums/69',
    icon: SiBoardgamegeek,
    label: 'BoardGameGeek',
    note: 'The Dune forums',
  },
] as const;

/**
 * Public waypoints to the project's component catalogue, source, policies, and community homes —
 * and the switch that overrides the OS's reduced-motion hint for this site (see `motion.ts`). The
 * switch is a bare checkbox because the chrome sits outside `ApplicationChrome`'s Mantine
 * provider.
 */
export function AppFooter() {
  const motion = useMotionAllowed();

  return (
    <div className={styles.waypoints}>
      <p className={styles.eyebrow}>Continue exploring</p>
      <nav aria-label="Footer">
        {footerLinks.map(({ href, icon: Icon, label, note }) => (
          <a
            className={styles.waypointLink}
            href={href}
            key={href}
            {...(href.startsWith('https://')
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : undefined)}
          >
            <span className={styles.icon}>
              <Icon aria-hidden size={20} strokeWidth={1.8} />
            </span>
            <span className={styles.linkCopy}>
              <strong>{label}</strong>
              <small>{note}</small>
            </span>
          </a>
        ))}
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
