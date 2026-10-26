// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:d3fe9b1cb34a83142166196c71f2dd224b5d7bf613f608fef8f318d7222109b2',
  digest: 'd3fe9b1cb34a83142166196c71f2dd224b5d7bf613f608fef8f318d7222109b2',
  components: {
    sources: '9251f48f80dcdead08bec8781c57a016d61280c29875f345e16737da7a7cc6bf',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: '9a4335a13bf38d70fc96afa11b6f6749db0e73d90d8e26ef4c86f8d9839bc3de',
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
