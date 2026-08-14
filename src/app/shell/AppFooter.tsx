import { BookOpen, GitFork, ShieldCheck } from 'lucide-react';

import styles from './AppFooter.module.css';
import { setMotionOverride, useMotionAllowed } from './motion';

const footerLinks = [
  {
    href: '/__storybook/',
    icon: BookOpen,
    label: 'Component library',
    note: 'Explore the interface',
  },
  {
    href: 'https://github.com/ndelangen/dunezone',
    icon: GitFork,
    label: 'Source code',
    note: 'Built in the open',
  },
  {
    href: '/privacy',
    icon: ShieldCheck,
    label: 'Privacy policy',
    note: 'How data is handled',
  },
] as const;

/**
 * Public waypoints to the project's component catalogue, source, and policies — and the switch that
 * overrides the OS's reduced-motion hint for this site (see `motion.ts`). The switch is a bare
 * checkbox because the chrome sits outside `ApplicationChrome`'s Mantine provider.
 */
export function AppFooter() {
  const motion = useMotionAllowed();

  return (
    <div className={styles.waypoints}>
      <p className={styles.eyebrow}>Continue exploring</p>
      <nav aria-label="Footer">
        {footerLinks.map(({ href, icon: Icon, label, note }) => (
          <a className={styles.waypointLink} href={href} key={href}>
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
