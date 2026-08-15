import { BookOpen, GitFork, ShieldCheck } from 'lucide-react';
import { useId } from 'react';

import styles from './AppFooter.module.css';
import { setSchemePreference, useSchemePreference } from './colorScheme';
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

const schemeOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/**
 * Public waypoints to the project's component catalogue, source, and policies — and the controls
 * that override the OS's appearance hints for this site: reduced motion (see `motion.ts`) and the
 * color scheme (see `colorScheme.ts`). Both are bare inputs because the chrome sits outside
 * `ApplicationChrome`'s Mantine provider.
 */
export function AppFooter() {
  const motion = useMotionAllowed();
  const scheme = useSchemePreference();
  /* Instance-scoped ids: autodocs renders several footers into one document, and a shared radio
     name would fuse their groups into a single arrow-key ring. */
  const schemeGroupId = useId();

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
      <div
        className={styles.schemeToggle}
        role="radiogroup"
        aria-labelledby={`${schemeGroupId}-label`}
      >
        <span className={styles.schemeSegments}>
          {schemeOptions.map(({ value, label }) => (
            <label className={styles.schemeSegment} key={value}>
              <input
                checked={scheme === value}
                className={styles.schemeInput}
                name={`${schemeGroupId}-scheme`}
                onChange={() => setSchemePreference(value)}
                type="radio"
              />
              <span className={styles.schemeLabel}>{label}</span>
            </label>
          ))}
        </span>
        <span className={styles.linkCopy}>
          <strong id={`${schemeGroupId}-label`}>Color scheme</strong>
          <small>Follow the system, or pin light or dark</small>
        </span>
      </div>
    </div>
  );
}
