// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:ba88dee7fef8c752ed454fc8442a5788f98f91f7f86a000b65d016014cf7e7de',
  digest: 'ba88dee7fef8c752ed454fc8442a5788f98f91f7f86a000b65d016014cf7e7de',
  components: {
    sources: '3b4d1a703bdc623bc29175477d323829df8f614c91ecb3aa4309ccbc2f23c150',
    toolchain: '67ad00c8c99d48a0882a69ae162434248e4cdf0959217b3844c4c55287e95a88',
    code: 'ce21127a493aa712d1030cbe8f2262a341b1cc4bc789d6c5596e7df0d859b853',
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
