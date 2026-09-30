// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:bdf0e1507b3b0e2d0e8c46fcfec0a90f337fab50fe0cc9878614156623076888',
  digest: 'bdf0e1507b3b0e2d0e8c46fcfec0a90f337fab50fe0cc9878614156623076888',
  components: {
    sources: '8147180295a65122905b097aa32fa14f2c1acb33aee3bc5b2f28a8bbd773165e',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '186b52f0fa10c5f5180e224cdd3bbb4c4f04846dfc2eb7d737efd2dc336d3dbf',
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
