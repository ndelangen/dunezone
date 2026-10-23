// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:bf68ea50d6ee78f1edc17b478a4f28cdd93cf414a7d75d80ac43ae947b321484',
  digest: 'bf68ea50d6ee78f1edc17b478a4f28cdd93cf414a7d75d80ac43ae947b321484',
  components: {
    sources: 'b779a505d1866fcf095c7a0e88ee6c7acfde11878e9bc0ea8967a396d6520792',
    toolchain: '1c9ac03aed0c51bdbcf307b77cfcaeb9efa8a682fb79c40f817c522bdd88ec6c',
    code: '5a4a033d4dd9de369f319e08f14fdea5ce4b3839cf0ecc154756d9e7e2d62822',
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
