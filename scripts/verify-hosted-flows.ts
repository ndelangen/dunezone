/**
 * The hosted browser flows the launcher runs against one stack, each on a fresh game.
 * It stays free of side effects, because the browser driver parses arguments and launches Chromium on import.
 */
export const browserFlows = {
  /* The regular flow steps through every phase behind the eight-second cooldown (#1139)
     and readies both players at each Mentat pause, which puts it past five minutes. */
  regular: { timeoutMs: 600_000, separateBrowsers: false, keepsFrames: false, needsCatalogue: false, shard: 'regular' },
  'public-controls': {
    timeoutMs: 300_000,
    separateBrowsers: false,
    keepsFrames: false,
    needsCatalogue: true,
    shard: 'catalogue',
  },
  'private-banks': {
    timeoutMs: 300_000,
    separateBrowsers: true,
    keepsFrames: true,
    needsCatalogue: false,
    shard: 'protocol',
  },
  battles: { timeoutMs: 300_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: true, shard: 'catalogue' },
  decks: { timeoutMs: 300_000, separateBrowsers: true, keepsFrames: true, needsCatalogue: false, shard: 'protocol' },
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
    /**
     * The `hosted_play` CI shard that runs the flow, which the launcher's `--shard` selects.
     * The flows that need the catalogue share `catalogue`, so only that shard seeds it.
     */
    shard: 'regular' | 'catalogue' | 'protocol';
  }
>;

export type BrowserFlow = keyof typeof browserFlows;

export function isBrowserFlow(name: string): name is BrowserFlow {
  return Object.hasOwn(browserFlows, name);
}

/** The flows one `hosted_play` CI shard runs, in the order above; none for a name no flow carries. */
export function flowsInShard(shard: string): BrowserFlow[] {
  return Object.keys(browserFlows)
    .filter(isBrowserFlow)
    .filter((flow) => browserFlows[flow].shard === shard);
}
