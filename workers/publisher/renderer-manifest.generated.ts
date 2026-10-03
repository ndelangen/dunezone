// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:9ae7f86d7ac1b98355c05dd9bd42cbe0e5fa0f8cc3f8a4326347300a06da941c',
  digest: '9ae7f86d7ac1b98355c05dd9bd42cbe0e5fa0f8cc3f8a4326347300a06da941c',
  components: {
    sources: 'c01af8be2e93c69d0020fa9cceab3563b2cec9eeed683aac67dc4e1f4c1041ed',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '4e34a160aff05787ba62a8b14f5b2292c37fb7ca77159207052c403e7aedaac8',
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
