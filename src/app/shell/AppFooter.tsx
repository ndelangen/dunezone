import { Tooltip } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { useId } from 'react';
import { FaRedditAlien } from 'react-icons/fa6';
import { SiBoardgamegeek, SiDiscord, SiGithub, SiStorybook } from 'react-icons/si';

import styles from './AppFooter.module.css';
import { setSchemePreference, useSchemePreference } from './colorScheme';
import { setMotionOverride, useMotionPreference } from './motion';

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
 * One preference as a labelled three-segment radio group.
 * Both footer preferences (motion, color scheme) share this single UI: System defers to the OS hint, the other two segments pin it.
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
 * Public waypoints to the project's component catalogue, source, policies, and community homes — and the controls that override the OS's appearance hints for this site: reduced motion (see `motion.ts`) and the color scheme (see
 * `colorScheme.ts`).
 * The waypoints are icon-only circles; one `label` per entry fans out to the accessible name and the
 * `Tooltip`, so the two cannot come apart.
 * The preference controls are bare inputs styled with the band rather than the content theme; both share the segmented radio treatment.
 */
export function AppFooter() {
  const motion = useMotionPreference();
  const scheme = useSchemePreference();

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
