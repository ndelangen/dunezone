import { useRouter, useRouterState } from '@tanstack/react-router';
import { BookOpen, ChevronLeft, ChevronRight, GitFork, ShieldCheck } from 'lucide-react';
import { type ComponentType, useEffect } from 'react';

import styles from './FooterLinksPrototype.module.css';

type VariantKey = 'A' | 'B' | 'C';

type FooterLink = {
  href: string;
  icon: ComponentType<{ 'aria-hidden'?: boolean; size?: number; strokeWidth?: number }>;
  label: string;
  note: string;
};

const variants: Array<{ key: VariantKey; name: string }> = [
  { key: 'A', name: 'Desert waypoints' },
  { key: 'B', name: 'Open archive' },
  { key: 'C', name: 'Brass ribbon' },
];

const footerLinks: FooterLink[] = [
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
];

function iconLinks(className: string) {
  return footerLinks.map(({ href, icon: Icon, label, note }) => (
    <a className={className} href={href} key={href}>
      <span className={styles.icon}>
        <Icon aria-hidden size={20} strokeWidth={1.8} />
      </span>
      <span className={styles.linkCopy}>
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
    </a>
  ));
}

function VariantA() {
  return (
    <div className={styles.waypoints}>
      <p className={styles.eyebrow}>Continue exploring</p>
      <nav aria-label="Footer">{iconLinks(styles.waypointLink)}</nav>
    </div>
  );
}

function VariantB() {
  return (
    <div className={styles.archive}>
      <div className={styles.archiveIntro}>
        <span className={styles.archiveMark} aria-hidden>
          DZ
        </span>
        <div>
          <p className={styles.eyebrow}>Dune Zone</p>
          <p>Tools and stories for the factions beyond the Shield Wall.</p>
        </div>
      </div>
      <nav aria-label="Footer">{iconLinks(styles.archiveLink)}</nav>
    </div>
  );
}

function VariantC() {
  return (
    <div className={styles.ribbon}>
      <span className={styles.ribbonLabel}>Follow the trail</span>
      <nav aria-label="Footer">{iconLinks(styles.ribbonLink)}</nav>
    </div>
  );
}

function selectedVariant(value: unknown): VariantKey {
  return value === 'B' || value === 'C' ? value : 'A';
}

export function FooterLinksPrototype() {
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const variant = selectedVariant(
    new URL(href, 'https://prototype.invalid').searchParams.get('variant')
  );
  const currentIndex = variants.findIndex(({ key }) => key === variant);

  const changeVariant = (direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + variants.length) % variants.length;
    const next = variants[nextIndex];
    const nextUrl = new URL(href, 'https://prototype.invalid');
    nextUrl.searchParams.set('variant', next.key);
    void router.navigate({
      href: `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
      replace: true,
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') changeVariant(-1);
      if (event.key === 'ArrowRight') changeVariant(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <>
      {/* PROTOTYPE: three footer directions, switchable via ?variant=, in the existing app shell. */}
      {variant === 'A' && <VariantA />}
      {variant === 'B' && <VariantB />}
      {variant === 'C' && <VariantC />}
      <aside className={styles.switcher} aria-label="Footer prototype variants">
        <button
          aria-label="Previous footer variant"
          onClick={() => changeVariant(-1)}
          type="button"
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <span>
          {variant} — {variants[currentIndex].name}
        </span>
        <button aria-label="Next footer variant" onClick={() => changeVariant(1)} type="button">
          <ChevronRight aria-hidden size={18} />
        </button>
      </aside>
    </>
  );
}
