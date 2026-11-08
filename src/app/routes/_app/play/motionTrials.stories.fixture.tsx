import type { Decorator } from '@storybook/tanstack-react';
import { useEffect } from 'react';

/*
 * Animation trials: each spot's candidate animations live in its stylesheet behind `<html data-trial-<spot>="<variant>">`,
 * so a story picks one variant without plumbing a prop through the table, and the Replay button restarts it.
 * Once a variant is chosen it becomes the spot's only animation and this fixture goes.
 */
export type TrialSpot = 'battle-pop' | 'ready' | 'turn-done';

function replay(spot: TrialSpot, variant: string) {
  const root = document.documentElement;
  const attribute = `data-trial-${spot}`;
  root.removeAttribute(attribute);
  /* Reading layout recalculates styles, so every animation the attribute drives restarts from its first frame. */
  void document.body.offsetHeight;
  root.setAttribute(attribute, variant);
}

function TrialReplay({ spot, variant }: { spot: TrialSpot; variant: string }) {
  useEffect(() => {
    document.documentElement.setAttribute(`data-trial-${spot}`, variant);
    return () => document.documentElement.removeAttribute(`data-trial-${spot}`);
  }, [spot, variant]);
  return (
    <button
      type="button"
      onClick={() => replay(spot, variant)}
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
      ↻ Replay “{variant}”
    </button>
  );
}

/** Pins one trial variant for the story and adds a Replay button in the corner. */
export function trial(spot: TrialSpot, variant: string): Decorator {
  return (Story) => (
    <>
      <Story />
      <TrialReplay spot={spot} variant={variant} />
    </>
  );
}
