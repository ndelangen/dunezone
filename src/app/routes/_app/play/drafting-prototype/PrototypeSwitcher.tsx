/* PROTOTYPE (#1142): floating variant switcher; dev builds only. */
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { DRAFT_VARIANTS } from './fixture';
import type { DraftVariant } from './fixture';

export function PrototypeSwitcher({ current, name }: Readonly<{ current: DraftVariant; name: string }>) {
  const navigate = useNavigate();
  const index = DRAFT_VARIANTS.indexOf(current);
  const go = (delta: number) => {
    const next = DRAFT_VARIANTS[(index + delta + DRAFT_VARIANTS.length) % DRAFT_VARIANTS.length];
    void navigate({ to: '/play/demo', search: (previous: Record<string, unknown>) => ({ ...previous, variant: next }) });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        go(-1);
      } else if (event.key === 'ArrowRight') {
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) {
    return null;
  }
  return (
    <div className="dp-switcher" role="group" aria-label="Prototype variant">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span>
        <strong>{current}</strong> — {name}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
