// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:9d85b6e322a1c17de65079a2971e4ec30a1364c88bc61426e8bbd563a693ac50',
  digest: '9d85b6e322a1c17de65079a2971e4ec30a1364c88bc61426e8bbd563a693ac50',
  components: {
    sources: 'd1d895486df74b77aad3c2c54f1409ee0e82d4a8d7ade30991c259a9944953d5',
    toolchain: '1b72a569d46b93089ef2ec6218a686ee27fda18c0e09e1396ad0aced9d2c8df3',
    code: '55a1ac8c4b0c4e74fc6bd67495103079311ed6e63cd81d55c3aa0da2ba41bed1',
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
