// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:1c161b6d7aa42afbf7974a06b1cdc7e0dfe07a72c4df870948898cdb39004823',
  digest: '1c161b6d7aa42afbf7974a06b1cdc7e0dfe07a72c4df870948898cdb39004823',
  components: {
    sources: 'c9cc9ebfc66ade931cb5f904047bb69a819634483a5c1f2080c19ffe8d7962d0',
    toolchain: 'ee68c7d1edd23b07efa633f6c0b422fbcc5f4ad1006db6986d247b4c7eb9f68d',
    code: 'ea698ad1b0204814d80e44cb19c21212f3b1a2247c17ff8d6449baa1bd60aec7',
    contract: '2920714c87493d104342355dda2b956202259513c78ce6195670034f31a656a6',
  },
  contract: {
    viewport: {
      width: 2100,
      height: 2970,
      deviceScaleFactor: 1,
    },
    pdf: {
      pageCount: 2,
      pageWidthMm: 210,
      pageHeightMm: 297,
      pageSizeToleranceMm: 0.5,
      displayHeaderFooter: false,
      marginMm: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      preferCssPageSize: true,
      printBackground: true,
    },
  },
} as const;
