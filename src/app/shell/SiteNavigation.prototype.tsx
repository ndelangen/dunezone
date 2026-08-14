import { Link } from '@tanstack/react-router';
import { ProfileLink } from '@ui/content/ProfileLink';
/* oxlint-disable jsx-a11y/anchor-is-valid -- dummy `href="#"` links; the prototype varies their count, not their targets */
/**
 * PROTOTYPE — THROWAWAY. Wayfinder ticket #383: which responsive pattern keeps any number of links,
 * of any length, visible or navigatable at every viewport width?
 *
 * Three variants over the real band, switchable from the floating bar (or ← / → keys), with a
 * link-count cycler (3 / 5 / 8 / 12, long labels included) because the question is the N, not
 * today's five links. Activate with `?nav-proto` on any route in dev; the real SiteNavigation
 * renders otherwise. Nothing here ships.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useCurrentProfile } from '@db/profiles';

import styles from './SiteNavigation.prototype.module.css';

const LINK_PRESETS: Record<string, string[]> = {
  '3': ['Home', 'Factions', 'Rulesets'],
  '5': ['Home', 'Factions', 'Rulesets', 'Profiles', 'Assets'],
  '8': [
    'Home',
    'Factions',
    'Rulesets',
    'Profiles',
    'Assets',
    'Battle Reports',
    'Events Calendar',
    'Community',
  ],
  '12': [
    'Home',
    'Factions',
    'Rulesets',
    'Profiles',
    'Assets',
    'Battle Reports',
    'Events Calendar',
    'Community',
    'Tournament Organizer Resources',
    'Errata & Clarifications',
    'Getting Started Guide',
    'Marketplace',
  ],
};

const VARIANTS = ['A', 'B', 'C'] as const;
type Variant = (typeof VARIANTS)[number];

/*
 * Wayfinder #384: the pattern is decided (priority-plus, #383) — the open question is the row's
 * visual treatment over the video band. The pill now cycles treatments; B/C remain reachable via
 * `?variant=` for reference but have no UI.
 */
const TREATMENTS = ['scrim', 'blur', 'shadow', 'darken'] as const;
type Treatment = (typeof TREATMENTS)[number];
const TREATMENT_NAMES: Record<Treatment, string> = {
  scrim: 'Gradient scrim',
  blur: 'Backdrop-blur bar',
  shadow: 'Text shadow only',
  darken: 'Artwork veil',
};
const TREATMENT_CLASS: Record<Treatment, string> = {
  scrim: 'treatScrim',
  blur: 'treatBlur',
  shadow: 'treatShadow',
  darken: 'treatDarken',
};

function readParam(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

function writeParams(variant: string, links: string, treatment: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('nav-proto', '');
  url.searchParams.set('variant', variant);
  url.searchParams.set('navlinks', links);
  url.searchParams.set('treatment', treatment);
  window.history.replaceState(null, '', url);
}

export function SiteNavigationPrototype() {
  const [variant] = useState<Variant>(() => {
    const v = readParam('variant', 'A').toUpperCase();
    return (VARIANTS as readonly string[]).includes(v) ? (v as Variant) : 'A';
  });
  const [preset, setPreset] = useState(() =>
    readParam('navlinks', '5') in LINK_PRESETS ? readParam('navlinks', '5') : '5'
  );
  const [treatment, setTreatment] = useState<Treatment>(() => {
    const t = readParam('treatment', 'scrim').toLowerCase();
    return (TREATMENTS as readonly string[]).includes(t) ? (t as Treatment) : 'scrim';
  });

  useEffect(() => writeParams(variant, preset, treatment), [variant, preset, treatment]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) {
        return;
      }
      const i = TREATMENTS.indexOf(treatment);
      if (e.key === 'ArrowLeft') {
        setTreatment(TREATMENTS[(i + TREATMENTS.length - 1) % TREATMENTS.length]);
      }
      if (e.key === 'ArrowRight') {
        setTreatment(TREATMENTS[(i + 1) % TREATMENTS.length]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [treatment]);

  const links = LINK_PRESETS[preset];

  return (
    <div className={styles[TREATMENT_CLASS[treatment]]}>
      {variant === 'A' && <PriorityPlusNav links={links} />}
      {variant === 'B' && <ScrollStripNav links={links} />}
      {variant === 'C' && <CollapseThresholdNav links={links} />}
      <div className={styles.switcher}>
        <button
          type="button"
          onClick={() =>
            setTreatment(
              TREATMENTS[
                (TREATMENTS.indexOf(treatment) + TREATMENTS.length - 1) % TREATMENTS.length
              ]
            )
          }
        >
          ←
        </button>
        <span className={styles.switcherLabel}>{TREATMENT_NAMES[treatment]}</span>
        <button
          type="button"
          onClick={() =>
            setTreatment(TREATMENTS[(TREATMENTS.indexOf(treatment) + 1) % TREATMENTS.length])
          }
        >
          →
        </button>
        <button
          type="button"
          className={styles.switcherLinks}
          onClick={() => {
            const keys = Object.keys(LINK_PRESETS);
            setPreset(keys[(keys.indexOf(preset) + 1) % keys.length]);
          }}
        >
          {preset} links
        </button>
      </div>
    </div>
  );
}

/** Logo left + account right — identical chrome in all three variants; only the middle varies. */
function NavFrame({ children }: { children: React.ReactNode }) {
  const profile = useCurrentProfile();
  return (
    <nav className={styles.root} aria-label="Primary navigation">
      <Link to="/" className={styles.logo} aria-label="Dune home">
        <img className={styles.logoImage} src="/web/logo.svg" alt="" />
      </Link>
      {children}
      <div className={styles.account}>
        {profile.data ? (
          <ProfileLink
            slug={profile.data.slug}
            username={profile.data.username}
            avatar_url={profile.data.avatar_url}
            className={styles.avatarLink}
            title={profile.data.username ?? 'Profile'}
            showUsername={false}
          />
        ) : (
          <a href="/auth/login">Login</a>
        )}
      </div>
    </nav>
  );
}

/**
 * The band is `overflow: hidden`, so an absolutely-positioned panel clips at its lower edge —
 * discovered on the mobile 12-link preset. `position: fixed` escapes that context; the real
 * implementation needs a portal or an overflow rethink. Clamped so it never leaves the viewport.
 */
function usePanelPosition() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) });
  };
  return { pos, place };
}

/* ---------- Variant A: priority-plus overflow ---------- */

function PriorityPlusNav({ links }: { links: string[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(links.length);
  const [open, setOpen] = useState(false);
  const { pos, place } = usePanelPosition();

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) {
      return;
    }

    const compute = () => {
      const MORE_RESERVE = 90;
      const group = row.parentElement as HTMLElement;
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth + 16);
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= group.clientWidth) {
        setVisibleCount(links.length);
        return;
      }
      const available = group.clientWidth - MORE_RESERVE;
      let used = 0;
      let fit = 0;
      for (const w of widths) {
        used += w;
        if (used > available) {
          break;
        }
        fit++;
      }
      setVisibleCount(fit);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(row.parentElement as HTMLElement);
    return () => ro.disconnect();
  }, [links]);

  const hidden = links.slice(visibleCount);

  return (
    <NavFrame>
      <div className={styles.priorityGroup}>
        <div className={styles.priorityRow} ref={rowRef}>
          <div className={styles.priorityMeasure} ref={measureRef} aria-hidden>
            {links.map((l) => (
              <a key={l} href="#" tabIndex={-1}>
                {l}
              </a>
            ))}
          </div>
          {links.slice(0, visibleCount).map((l, i) => (
            <a key={l} href="#" className={i === 1 ? styles.activeDemo : undefined}>
              {l}
            </a>
          ))}
        </div>
        {hidden.length > 0 && (
          <span className={styles.moreWrap}>
            <button
              type="button"
              className={styles.moreButton}
              onClick={(e) => {
                place(e.currentTarget);
                setOpen(!open);
              }}
            >
              More ▾
            </button>
            {open && pos && (
              <div className={styles.morePanel} style={{ position: 'fixed', ...pos }}>
                {hidden.map((l) => (
                  <a key={l} href="#" onClick={() => setOpen(false)}>
                    {l}
                  </a>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
    </NavFrame>
  );
}

/* ---------- Variant B: scrollable strip ---------- */

function ScrollStripNav({ links }: { links: string[] }) {
  return (
    <NavFrame>
      <div className={styles.scrollStrip}>
        {links.map((l) => (
          <a key={l} href="#">
            {l}
          </a>
        ))}
      </div>
    </NavFrame>
  );
}

/* ---------- Variant C: collapse threshold ---------- */

function CollapseThresholdNav({ links }: { links: string[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [open, setOpen] = useState(false);
  const { pos, place } = usePanelPosition();

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) {
      return;
    }

    const group = row.parentElement as HTMLElement;
    const compute = () => setFits(measure.scrollWidth <= group.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(group);
    return () => ro.disconnect();
  }, [links]);

  return (
    <NavFrame>
      <div className={styles.priorityGroup}>
        <div className={styles.collapseRow} ref={rowRef}>
          <div className={styles.priorityMeasure} ref={measureRef} aria-hidden>
            {links.map((l) => (
              <a key={l} href="#" tabIndex={-1}>
                {l}
              </a>
            ))}
          </div>
          {fits &&
            links.map((l) => (
              <a key={l} href="#">
                {l}
              </a>
            ))}
        </div>
        {!fits && (
          <span className={styles.moreWrap}>
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={open}
              onClick={(e) => {
                place(e.currentTarget);
                setOpen(!open);
              }}
            >
              ☰ Menu
            </button>
            {open && pos && (
              <div className={styles.drawer} style={{ position: 'fixed', ...pos }}>
                {links.map((l) => (
                  <a key={l} href="#" onClick={() => setOpen(false)}>
                    {l}
                  </a>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
    </NavFrame>
  );
}
