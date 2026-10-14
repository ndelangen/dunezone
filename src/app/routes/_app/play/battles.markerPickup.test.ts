/* @vitest-environment jsdom */
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('../../storybookConfig', () => ({ pageStoryMeta: {} }));
vi.stubEnv('VITE_CONVEX_URL', 'https://storybook.invalid');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

test('the marker gesture waits for the seated camera and runs once', async () => {
  const { dragBattleMarker } = await import('./battles.marker.stories.fixture');
  vi.stubGlobal('PointerEvent', MouseEvent);
  const shell = document.createElement('div');
  shell.className = 'dune-play-shell';
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  shell.append(canvas);
  const marker = document.createElement('button');
  marker.textContent = 'Drag battle marker onto territory';
  shell.append(marker);
  document.body.append(shell);

  let early = 0;
  let gestures = 0;
  let placed = false;
  const down = () => {
    gestures += 1;
    canvas.style.cursor = 'grabbing';
  };
  const up = () => {
    canvas.style.cursor = '';
    if (canvas.dataset.playCamera === 'ready') {
      placed = true;
    } else {
      early += 1;
      /* Stop a mutation-driven retry loop so the regression can report the premature gestures. */
      if (early === 2) {
        marker.remove();
      }
    }
  };
  marker.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  vi.useFakeTimers();
  setTimeout(() => {
    canvas.dataset.playCamera = 'ready';
    shell.append(marker);
  }, 100);
  try {
    await Promise.all([
      dragBattleMarker(document, [0, 0.18, 0], () => expect(placed).toBe(true)),
      vi.advanceTimersByTimeAsync(200),
    ]);
    expect(early).toBe(0);
    expect(gestures).toBe(1);
  } finally {
    marker.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
  }
});

test('a refused drop times out without repeating the gesture', async () => {
  const { dragBattleMarker } = await import('./battles.marker.stories.fixture');
  vi.stubGlobal('PointerEvent', MouseEvent);
  const shell = document.createElement('div');
  shell.className = 'dune-play-shell';
  const canvas = document.createElement('canvas');
  canvas.dataset.playCamera = 'ready';
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  const marker = document.createElement('button');
  marker.textContent = 'Drag battle marker onto territory';
  shell.append(canvas, marker);
  document.body.append(shell);

  let gestures = 0;
  const down = () => {
    gestures += 1;
    canvas.style.cursor = 'grabbing';
  };
  const up = () => {
    canvas.style.cursor = '';
    /* A repeated gesture must not starve the regression's own timeout. */
    if (gestures === 2) {
      marker.remove();
    }
  };
  marker.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  vi.useFakeTimers();
  try {
    await Promise.all([
      expect(
        dragBattleMarker(document, [0, 0.18, 0], () => {
          throw new Error('The battle was not placed');
        })
      ).rejects.toThrow('The battle was not placed'),
      vi.advanceTimersByTimeAsync(30_100),
    ]);
    expect(gestures).toBe(1);
  } finally {
    marker.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
  }
});
