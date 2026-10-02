import { useEffect, useState } from 'react';

export type TableGraphics = 'checking' | 'ready' | 'unavailable';

export const TABLE_GRAPHICS_UNAVAILABLE =
  "This browser can't draw the table. Turn on hardware acceleration in its settings, or try another browser.";

/* One answer per page: the browser's graphics do not change while it stays open. */
let known: Exclude<TableGraphics, 'checking'> | undefined;

/* The renderer draws with WebGPU when an adapter answers and falls back to WebGL2 otherwise; with neither, its creation throws. */
function canCreateWebGL2(): boolean {
  const context = document.createElement('canvas').getContext('webgl2');
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  return context !== null;
}

async function hasWebGPUAdapter(): Promise<boolean> {
  try {
    return !!(await navigator.gpu?.requestAdapter());
  } catch {
    return false;
  }
}

/** Whether the table's renderer can start here, so a browser without WebGPU or WebGL2 reads a message instead of a crash. */
export function useTableGraphics(): TableGraphics {
  const [graphics, setGraphics] = useState<TableGraphics>(() => {
    if (!known && canCreateWebGL2()) {
      known = 'ready';
    }
    return known ?? 'checking';
  });
  useEffect(() => {
    if (graphics !== 'checking') {
      return;
    }
    let current = true;
    void hasWebGPUAdapter().then((adapter) => {
      known = adapter ? 'ready' : 'unavailable';
      if (current) {
        setGraphics(known);
      }
    });
    return () => {
      current = false;
    };
  }, [graphics]);
  return graphics;
}

/** For tests: forget the page's answer. */
export function resetTableGraphics() {
  known = undefined;
}
