// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:2817e4b3de07b4a4c3bdc2e419374029d2f15aa693a0444e524ac23e5c3b8972',
  digest: '2817e4b3de07b4a4c3bdc2e419374029d2f15aa693a0444e524ac23e5c3b8972',
  components: {
    sources: 'b6c679c1be955785053c3112bb3788f49957748fa2f9086e8c31cd5e1bacf4c2',
    toolchain: 'f4c69d90dcb347d91cc47266b21853233aee418d21bfd8804e654b9121022db4',
    code: '324ff3527fff5dac179c9d6eb8d4d083e836c4af8584bb93f0e70d0b12b99924',
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
