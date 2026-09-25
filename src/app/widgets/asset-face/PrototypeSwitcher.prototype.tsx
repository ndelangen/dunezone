/*
 * PROTOTYPE, throwaway: the floating variant switcher for the published-image arrival prototype.
 * Cycles Today (no `?variant`, main's rendering), A, B, C and D; arrow keys cycle too; `?slow` and `?scatter` are kept.
 * Hidden in production builds.
 */
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { PROTOTYPE_IMAGE_VARIANTS, usePrototypeImageSettings } from './PublishedImage.prototype';

const STEPS = [{ key: null, name: 'Today (main)' }, ...PROTOTYPE_IMAGE_VARIANTS] as const;

export function PrototypeImageSwitcher() {
  const { variant, slow, scatter } = usePrototypeImageSettings();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> });
  const index = Math.max(
    0,
    STEPS.findIndex((step) => step.key === variant)
  );
  const current = STEPS[index] ?? STEPS[0];

  const go = (delta: number) => {
    const next = STEPS[(index + delta + STEPS.length) % STEPS.length] ?? STEPS[0];
    const { variant: _dropped, ...rest } = search;
    /* A full reload, so each variant starts from a cold page rather than from images another variant already decoded. */
    void navigate({ to: pathname, search: next.key ? { ...rest, variant: next.key } : rest, replace: true }).then(() =>
      window.location.reload()
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) {
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

  if (import.meta.env.PROD) {
    return null;
  }

  const button = {
    all: 'unset',
    cursor: 'pointer',
    padding: '6px 10px',
    fontSize: 18,
    lineHeight: 1,
  } as const;

  return (
    <div
      data-prototype-switcher
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 10_000,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: '#111',
        color: '#fff',
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        font: '600 12px/1.2 system-ui, sans-serif',
        maxWidth: 'calc(100vw - 24px)',
        whiteSpace: 'nowrap',
      }}
    >
      <button type="button" style={button} onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span style={{ padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {current.key ? `${current.key}: ` : ''}
        {current.name}
        {slow ? ` · slow ${slow}ms, scatter ${scatter}ms` : ''}
      </span>
      <button type="button" style={button} onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
