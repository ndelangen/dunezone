// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:cf320c1384e33b6581c2701384157b2d7504e59bcdfec82939d55c03c57a3e90',
  digest: 'cf320c1384e33b6581c2701384157b2d7504e59bcdfec82939d55c03c57a3e90',
  components: {
    sources: 'bc20d7ba2178ac648e0688844992cfaa7fb72258852eabb834408b81ddd5796c',
    toolchain: 'df38b3277de26c074c7b12763e5a5817e5c08c6940bd94f4e1e5c531dcf21b5b',
    code: '93aeddeac9503735c4dd2c0053f3677a5ba7978d7ade7eb014a86e151ea2735a',
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
