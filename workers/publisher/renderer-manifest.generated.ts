// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:e5f964834e906b45f2fa5f410db1fe03b49d24db4126cf296024c74e952f2faa',
  digest: 'e5f964834e906b45f2fa5f410db1fe03b49d24db4126cf296024c74e952f2faa',
  components: {
    sources: 'f7428e910e0b7cbe292884f71bdd1031e2e8f8d4629a4b737957958899da9800',
    toolchain: '37e64dd78013476fba4712e5dbf6a6e31c8fa627934770eb0f63ef984336c3c4',
    code: '53c807219cf1b02f926d7fa9b1063ca107cdbea7f8a56fe647bee9094f0506b5',
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
