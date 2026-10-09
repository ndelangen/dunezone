// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:d3e87fb625d18dd8ac60865977424e8c9b9a74def27bd3f810407c86a6b41b3c',
  digest: 'd3e87fb625d18dd8ac60865977424e8c9b9a74def27bd3f810407c86a6b41b3c',
  components: {
    sources: '5570b7126a626fc14cbf9d05b00ab4d1c279faaeb75d7056ae02f9f85c534d90',
    toolchain: '860a4382f094977421a6ad0b72103b2a119f43cfc5f0a0959ed0b0367c4d282c',
    code: '93c377f44aa4a40e2c3ce1f5aa02ae2039314f97911b32455c73524559d33a95',
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
