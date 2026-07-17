// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing release assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererVersion: 'faction-sheet-v3',
  supportedRendererVersions: ['faction-sheet-v3'],
  rendererId:
    'faction-sheet/sha256:21b06ee2aea6a7f18b095102ac2f0b24d87386d2a9ebbd9e6a1a661f69da9bd4',
  digest: '21b06ee2aea6a7f18b095102ac2f0b24d87386d2a9ebbd9e6a1a661f69da9bd4',
  contract: {
    rendererVersion: 'faction-sheet-v3',
    supportedRendererVersions: ['faction-sheet-v3'],
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
