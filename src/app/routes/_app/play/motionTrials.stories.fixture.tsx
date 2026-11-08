import type { ReactNode } from 'react';
import { useEffect } from 'react';

/*
 * Animation trials: each spot's candidate animations live in its stylesheet behind `<html data-trial-<spot>="<variant>">`,
 * so a story picks one variant without plumbing a prop through the table.
 * Once a variant is chosen it becomes the spot's only animation and this fixture goes.
 */
export type TrialSpot = 'battle-pop' | 'claim';

/** Pins the spot's variant on <html> while the story shows; no variant is today's behaviour. */
export function useTrialVariant(spot: TrialSpot, variant: string | undefined) {
  useEffect(() => {
    if (!variant) {
      return;
    }
    document.documentElement.setAttribute(`data-trial-${spot}`, variant);
    return () => document.documentElement.removeAttribute(`data-trial-${spot}`);
  }, [spot, variant]);
}

/** The trial's control, in the corner over the story. */
export function TrialButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
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
