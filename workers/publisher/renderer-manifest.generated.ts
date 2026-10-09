// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:eb863dcac42e8513978d5b01f3efd5e5e8f2402ca0903fe0f1fbba6d7c1906c4',
  digest: 'eb863dcac42e8513978d5b01f3efd5e5e8f2402ca0903fe0f1fbba6d7c1906c4',
  components: {
    sources: '5570b7126a626fc14cbf9d05b00ab4d1c279faaeb75d7056ae02f9f85c534d90',
    toolchain: 'c099d46d2787f083699bbefd3b7708dc90a22e624df230877146b780adbd31fb',
    code: 'f80fe99667d8b200062b80c6c1d5931e47b40eaa5fa8c3daf08d05cc93942631',
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
