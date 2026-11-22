import type { ReactNode } from 'react';

/** A story's own replay control, in the corner over the page. */
export function ReplayButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 1000,
        padding: '6px 12px',
        border: '1px solid var(--edge, #8a7a5c)',
        borderRadius: 999,
        background: 'var(--ui-ground, #1d1914)',
        color: 'var(--sand, #e8d9b8)',
        font: '600 13px var(--font-sans, sans-serif)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
