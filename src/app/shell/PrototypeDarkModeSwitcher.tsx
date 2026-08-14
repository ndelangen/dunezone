// PROTOTYPE — wipe me. Floating bar cycling the dark-palette variants for wayfinder #393.
// Four states on any route via ?variant=: light (current theme), ember, moonlit, twilight.
import { useEffect, useState } from 'react';

import '../styles/prototype-dark-variants.css';

const VARIANTS = [
  { key: 'light', name: 'Current light theme' },
  { key: 'ember', name: 'Ember — warm night, brand palette kept' },
  { key: 'moonlit', name: 'Moonlit — cool chrome from the artwork' },
  { key: 'twilight', name: 'Twilight — cool surfaces, warm signals' },
] as const;

type VariantKey = (typeof VARIANTS)[number]['key'];

function readVariant(): VariantKey {
  const raw = new URLSearchParams(window.location.search).get('variant');
  return (VARIANTS.some((v) => v.key === raw) ? raw : 'light') as VariantKey;
}

export function PrototypeDarkModeSwitcher() {
  const [variant, setVariant] = useState<VariantKey>('light');

  useEffect(() => {
    setVariant(readVariant());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (variant === 'light') delete root.dataset.protoDark;
    else root.dataset.protoDark = variant;
    const url = new URL(window.location.href);
    if (variant === 'light') url.searchParams.delete('variant');
    else url.searchParams.set('variant', variant);
    window.history.replaceState(null, '', url);
  }, [variant]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') setVariant(cycle(-1));
      if (event.key === 'ArrowRight') setVariant(cycle(1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (import.meta.env.PROD) return null;

  const index = VARIANTS.findIndex((v) => v.key === variant);
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        borderRadius: 999,
        background: '#111',
        color: '#fff',
        font: '13px/1.2 monospace',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      <button type="button" style={arrowStyle} onClick={() => setVariant(cycle(-1))}>
        ←
      </button>
      <span>
        {index + 1}/{VARIANTS.length} · {VARIANTS[index]?.name}
      </span>
      <button type="button" style={arrowStyle} onClick={() => setVariant(cycle(1))}>
        →
      </button>
    </div>
  );
}

function cycle(step: number) {
  return (current: VariantKey): VariantKey => {
    const index = VARIANTS.findIndex((v) => v.key === current);
    const next = (index + step + VARIANTS.length) % VARIANTS.length;
    return VARIANTS[next]!.key;
  };
}

const arrowStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #555',
  borderRadius: 999,
  color: '#fff',
  width: 26,
  height: 26,
  cursor: 'pointer',
};
