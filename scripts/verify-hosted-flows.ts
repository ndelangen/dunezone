/**
 * The hosted browser flows the launcher runs against one stack, each on a fresh game.
 * It stays free of side effects, because the browser driver parses arguments and launches Chromium on import.
 */
export const browserFlows = {
  /* It steps through every phase behind the eight-second cooldown (#1139) and readies both players at each Mentat pause. */
  regular: { timeoutMs: 600_000, separateBrowsers: false, keepsFrames: false, needsCatalogue: false },
  'public-controls': { timeoutMs: 300_000, separateBrowsers: false, keepsFrames: false, needsCatalogue: true },
  'private-banks': { timeoutMs: 300_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: false },
  battles: { timeoutMs: 300_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: true },
  decks: { timeoutMs: 300_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: false },
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
