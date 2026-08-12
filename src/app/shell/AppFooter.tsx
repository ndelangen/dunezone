import { BookOpen, GitFork, ShieldCheck } from 'lucide-react';

import styles from './AppFooter.module.css';

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

/** Public waypoints to the project's component catalogue, source, and policies. */
export function AppFooter() {
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
    </div>
  );
}
