// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:78c2658f56f00a6f203f5f0fbded51229c3f6b95a7da0478245fbb82dedfbfbc',
  digest: '78c2658f56f00a6f203f5f0fbded51229c3f6b95a7da0478245fbb82dedfbfbc',
  components: {
    sources: '763129f6c5e1a496d313a22e1f8be2114f412c996aa294daefdb023e02454890',
    toolchain: '67ad00c8c99d48a0882a69ae162434248e4cdf0959217b3844c4c55287e95a88',
    code: 'e2d9411442eeb5a6c825b8b4829168570f9fc61d44d3ada865d483898dfc84b3',
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
