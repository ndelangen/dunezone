import { BookOpen, GitFork, ShieldCheck } from 'lucide-react';
import { useId } from 'react';

import styles from './AppFooter.module.css';
import { setSchemePreference, useSchemePreference } from './colorScheme';
import { setMotionOverride, useMotionPreference } from './motion';

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
 * One preference as a labelled three-segment radio group. Both footer preferences (motion, color
 * scheme) share this single UI: System defers to the OS hint, the other two segments pin it.
 */
function PreferenceSegments<Value extends string>({
  label,
  note,
  options,
  value,
  onChange,
}: {
  label: string;
  note: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (next: Value) => void;
}) {
  /* Instance-scoped ids: autodocs renders several footers into one document, and a shared radio
     name would fuse their groups into a single arrow-key ring. */
  const groupId = useId();

  return (
    <div className={styles.preference} role="radiogroup" aria-labelledby={`${groupId}-label`}>
      <span className={styles.segments}>
        {options.map((option) => (
          <label className={styles.segment} key={option.value}>
            <input
              checked={value === option.value}
              className={styles.segmentInput}
              name={`${groupId}-preference`}
              onChange={() => onChange(option.value)}
              type="radio"
            />
            <span className={styles.segmentLabel}>{option.label}</span>
          </label>
        ))}
      </span>
      <span className={styles.linkCopy}>
        <strong id={`${groupId}-label`}>{label}</strong>
        <small>{note}</small>
      </span>
    </div>
  );
}

/**
 * Public waypoints to the project's component catalogue, source, and policies — and the controls
 * that override the OS's appearance hints for this site: reduced motion (see `motion.ts`) and the
 * color scheme (see `colorScheme.ts`). Both are bare inputs because the chrome sits outside
 * `ApplicationChrome`'s Mantine provider.
 */
export function AppFooter() {
  const motion = useMotionPreference();
  const scheme = useSchemePreference();

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
      <PreferenceSegments
        label="Ambient motion"
        note="The masthead video and the turning dice"
        options={[
          { value: 'system', label: 'System' },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        value={motion}
        onChange={(next) => setMotionOverride(next === 'system' ? null : next)}
      />
      <PreferenceSegments
        label="Color scheme"
        note="Follow the system, or pin light or dark"
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        value={scheme}
        onChange={setSchemePreference}
      />
    </div>
  );
}
