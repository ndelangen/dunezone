// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:9bb0294ba0e60f9a7255ee4ef6e965c175e9f90816d36f7c8cad379fb1d43bd3',
  digest: '9bb0294ba0e60f9a7255ee4ef6e965c175e9f90816d36f7c8cad379fb1d43bd3',
  components: {
    sources: '8d1970abc9430e187647d31cf5c08b615e3f591115c2c07ac998e7f95aee1a34',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '24287fc8f9528e34567f93b0fb376e6d8852c9d8699ee4fe016110659b6c5114',
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
