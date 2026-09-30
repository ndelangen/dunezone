// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:e18a7e0e778fe05a47a10dd3c205e025d4bfb12372c2eaee2ddea9f2bb7f5674',
  digest: 'e18a7e0e778fe05a47a10dd3c205e025d4bfb12372c2eaee2ddea9f2bb7f5674',
  components: {
    sources: '03f8cac067c56a97e71dbf0f5545337b7a75873d3065304aeec6592a8f13f7ee',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '42d574aa7b26025e71539cd4c16f647fd14a858ce1185eac6f6c5a7c46dc8ab2',
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
