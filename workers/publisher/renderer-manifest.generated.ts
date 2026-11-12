// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:5681fa8a2447c75be8a41c16ad4c88b59fb08fecbde939ab244c4fac5ae89fa5',
  digest: '5681fa8a2447c75be8a41c16ad4c88b59fb08fecbde939ab244c4fac5ae89fa5',
  components: {
    sources: '3b4d1a703bdc623bc29175477d323829df8f614c91ecb3aa4309ccbc2f23c150',
    toolchain: '67ad00c8c99d48a0882a69ae162434248e4cdf0959217b3844c4c55287e95a88',
    code: '3715ea3ce88b92c10458e57eb85c76dcd1eefc9e3750a5a5a47490a8217b6a8e',
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
