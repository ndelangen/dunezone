// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:c1e5431058b4e96e4e702dd4ddfe6cfe8d5cf739ce6fc34e8f6926c2ac348c7f',
  digest: 'c1e5431058b4e96e4e702dd4ddfe6cfe8d5cf739ce6fc34e8f6926c2ac348c7f',
  components: {
    sources: '3b4d1a703bdc623bc29175477d323829df8f614c91ecb3aa4309ccbc2f23c150',
    toolchain: '67ad00c8c99d48a0882a69ae162434248e4cdf0959217b3844c4c55287e95a88',
    code: '11e9e9ebde6e1d3a3dfb481068f1d77bd1c13f4ba5d75de6419a1579e2fd1902',
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
