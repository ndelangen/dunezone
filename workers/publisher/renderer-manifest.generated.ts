// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:c90d39e2f194f5a56affc8093886082ae90897d2bec18c0586fad9c12b1a9b26',
  digest: 'c90d39e2f194f5a56affc8093886082ae90897d2bec18c0586fad9c12b1a9b26',
  components: {
    sources: '49e03f0177e8a60f7205aa511ef5c9eae1ffd365ff3c60ee66d0bba34083e725',
    toolchain: 'f3a1b265a116b4fd4fe11cf401918ef561a9d8c134cb9ce21267698147960224',
    code: '1f2b50b81c2c57d3ae674055842a60b459aef861202089e0d30fb627d743b1f4',
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
