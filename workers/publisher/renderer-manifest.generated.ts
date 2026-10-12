// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:8fbb8c3f879408f7e3989505aeedf93040798ece24ae4c81d97a98e85efd895c',
  digest: '8fbb8c3f879408f7e3989505aeedf93040798ece24ae4c81d97a98e85efd895c',
  components: {
    sources: '49e03f0177e8a60f7205aa511ef5c9eae1ffd365ff3c60ee66d0bba34083e725',
    toolchain: 'f3a1b265a116b4fd4fe11cf401918ef561a9d8c134cb9ce21267698147960224',
    code: '2e0f91944ca372e3230b6aa0f42f4cbb3b424dd7338912651eb401fb46401e8c',
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
