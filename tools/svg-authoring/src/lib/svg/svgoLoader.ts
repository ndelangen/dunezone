/**
 * Lazy loader for SVGO. SVGO is heavy (~hundreds of KB) so it is only imported
 * the first time a "heavy" optimize runs. Once loaded, `optimize` is fully
 * synchronous, which lets the pipeline stay synchronous after preloading.
 */
type SvgoOptimize = (
  svg: string,
  config?: Record<string, unknown>,
) => { data: string };

let cached: SvgoOptimize | null = null;
let loading: Promise<SvgoOptimize> | null = null;

const LOAD_TIMEOUT_MS = 8000;

export async function ensureSvgo(): Promise<SvgoOptimize> {
  if (cached) return cached;
  if (!loading) {
    loading = (async () => {
      const mod = (await import("svgo/browser")) as unknown as {
        optimize: SvgoOptimize;
      };
      cached = mod.optimize;
      return cached;
    })();
  }
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("SVGO load timed out")), LOAD_TIMEOUT_MS),
  );
  return Promise.race([loading, timeout]);
}

export function getSvgo(): SvgoOptimize | null {
  return cached;
}

/** Run SVGO with a content-preserving default preset. */
export function optimizeWithSvgo(svg: string, precision: number): string {
  if (!cached) return svg;
  try {
    const result = cached(svg, {
      multipass: true,
      floatPrecision: precision,
      plugins: [
        {
          name: "preset-default",
          params: {
            overrides: {
              // Keep the viewBox — it is the contract for our pipeline.
              removeViewBox: false,
            },
          },
        },
      ],
    });
    return result.data || svg;
  } catch {
    return svg;
  }
}
