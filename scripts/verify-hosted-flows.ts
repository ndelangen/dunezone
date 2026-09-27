/**
 * The hosted browser flows the launcher runs against one stack, each on a fresh game.
 * It stays free of side effects, because the browser driver parses arguments and launches Chromium on import.
 */
/* Diagnostic (#1343, not for merge): twice the budgets, so a slow host's whole duration is measured. */
export const browserFlows = {
  /* The regular flow steps through every phase behind the eight-second cooldown (#1139)
     and readies both players at each Mentat pause, which puts it past five minutes. */
  regular: { timeoutMs: 1_200_000, separateBrowsers: false, keepsFrames: false, needsCatalogue: false },
  'public-controls': { timeoutMs: 600_000, separateBrowsers: false, keepsFrames: false, needsCatalogue: true },
  'private-banks': { timeoutMs: 300_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: false },
  battles: { timeoutMs: 600_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: true },
  decks: { timeoutMs: 300_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: false },
  /* Diagnostic (#1343, not for merge): per-setting frame timing on the runner's SwiftShader. */
  bench: { timeoutMs: 1_800_000, separateBrowsers: false, keepsFrames: false, needsCatalogue: false },
} satisfies Record<
  string,
  {
    timeoutMs: number;
    /** Player B runs in its own Chromium process, so private state cannot cross a shared browser. */
    separateBrowsers: boolean;
    /** Received game frames are retained as `${flow}-frames.json` for audience inspection. */
    keepsFrames: boolean;
    /** The flow selects the seeded public catalogue's token by exact name, so the stack seeds it once. */
    needsCatalogue: boolean;
  }
>;

export type BrowserFlow = keyof typeof browserFlows;

export function isBrowserFlow(name: string): name is BrowserFlow {
  return Object.hasOwn(browserFlows, name);
}
