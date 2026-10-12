// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:a6132e6a92f1720839913bd7b9b48492fa65df973997ae99f0c5f8c2afdf98bd',
  digest: 'a6132e6a92f1720839913bd7b9b48492fa65df973997ae99f0c5f8c2afdf98bd',
  components: {
    sources: '49e03f0177e8a60f7205aa511ef5c9eae1ffd365ff3c60ee66d0bba34083e725',
    toolchain: '4d33f522ef0233bf3a9da1cd6bfbfb4ffc27e2270163caff5153c45ab00f223c',
    code: 'e22b3d5e8090ebf03a1d93f766ad7032472d98101bded5dbb73f2d416960d5ab',
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
