/**
 * What drew the Play table in a hosted browser flow, which Chromium ran it, and the expectation a run can hold the table to.
 * It stays free of side effects, because the launcher and the browser driver both import it.
 */

/** The renderers `--expect-renderer` accepts, each one the class a table's renderer falls into. */
export const rendererKinds = ['webgpu', 'webgl2-swiftshader', 'webgl2-other'] as const;

type RendererKind = (typeof rendererKinds)[number];

/** What the table's page reports: the backend three.js initialised, or why none was read. */
type TableRendererObservation =
  | { backend: 'webgpu'; adapter: { vendor: string; architecture: string } }
  | { backend: 'webgl2'; glRenderer: string }
  | { unidentified: string };

export function parseExpectedRenderer(value: string | undefined): RendererKind | undefined {
  if (value === undefined) {
    return undefined;
  }
  const kind = rendererKinds.find((candidate) => candidate === value);
  if (!kind) {
    throw new Error(`--expect-renderer must be one of ${rendererKinds.join(', ')}, not ${value}.`);
  }
  return kind;
}

/** The report's `renderer` field for what the page observed; `unidentified` keeps the reason no backend was read. */
export function rendererReport(observation: TableRendererObservation) {
  if ('unidentified' in observation) {
    return { kind: 'unidentified' as const, reason: observation.unidentified };
  }
  switch (observation.backend) {
    case 'webgpu':
      return { kind: 'webgpu' as const, ...observation };
    case 'webgl2':
      return {
        kind: /\bSwiftShader\b/u.test(observation.glRenderer)
          ? ('webgl2-swiftshader' as const)
          : ('webgl2-other' as const),
        ...observation,
      };
  }
}

/** Why the recorded renderer fails `--expect-renderer`, naming both; undefined when it matches or no renderer is expected. */
export function rendererMismatch(
  expected: RendererKind | undefined,
  renderer: ReturnType<typeof rendererReport> | undefined
): string | undefined {
  if (expected === undefined || renderer?.kind === expected) {
    return undefined;
  }
  const refusal = `--expect-renderer is ${expected}, but`;
  switch (renderer?.kind) {
    case undefined:
      return `${refusal} the flow opened no Play table, so no renderer was recorded.`;
    case 'unidentified':
      return `${refusal} the Play table's renderer was not identified: ${renderer.reason}.`;
    case 'webgpu':
      return `${refusal} the Play table rendered with webgpu (adapter ${renderer.adapter.vendor} ${renderer.adapter.architecture}).`;
    case 'webgl2-swiftshader':
    case 'webgl2-other':
      return `${refusal} the Play table rendered with ${renderer.kind} (${renderer.glRenderer}).`;
  }
}

/**
 * The Chromium build and executable, from the running browser's `Browser.getVersion` product and `SystemInfo.getInfo` command line.
 * Playwright's headless shell names its product `HeadlessChrome`, and full Chromium in new headless mode names it `Chrome`.
 * The command line joins the arguments with spaces and each switch starts with `--`, so the executable path, spaces and all, ends before the first switch.
 */
export function runningChromium(product: string, commandLine: string) {
  return {
    build: product.startsWith('HeadlessChrome/') ? ('headless-shell' as const) : ('full' as const),
    executable: commandLine.split(' --', 1)[0]!,
  };
}
