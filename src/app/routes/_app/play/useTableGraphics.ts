import { useEffect, useState } from 'react';

export type TableGraphics = 'checking' | 'ready' | 'unavailable';

export const TABLE_GRAPHICS_UNAVAILABLE =
  "This browser can't draw the table. Turn on hardware acceleration in its settings, or try another browser.";

/* A browser that drew once can draw again, so a yes holds for the page; a no is asked again on the next mount, since a driver reset can refuse once. */
let known: 'ready' | undefined;

/* An adapter request that hangs (some virtualised GPUs) reads as no adapter, so the stage does not open onto nothing. */
const ADAPTER_WAIT_MS = 3000;

/* The renderer draws with WebGPU when an adapter answers and falls back to WebGL2 otherwise; with neither, its creation throws. */
function canCreateWebGL2(): boolean {
  const context = document.createElement('canvas').getContext('webgl2');
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  return context !== null;
}

/* The same request three.js makes, so a compatibility-only GPU counts; the installed WebGPU types predate `featureLevel`. */
const ADAPTER_OPTIONS: GPURequestAdapterOptions & { featureLevel: 'compatibility' } = {
  featureLevel: 'compatibility',
  powerPreference: 'high-performance',
};

async function hasWebGPUAdapter(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const adapter = navigator.gpu?.requestAdapter(ADAPTER_OPTIONS);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ADAPTER_WAIT_MS);
    });
    return !!(await Promise.race([adapter, timeout]));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
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
      if (adapter) {
        known = 'ready';
      }
      if (current) {
        setGraphics(adapter ? 'ready' : 'unavailable');
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
