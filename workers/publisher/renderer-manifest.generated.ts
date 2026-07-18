// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing release assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererVersion: 'faction-sheet-v3',
  supportedRendererVersions: ['faction-sheet-v3'],
  rendererId:
    'faction-sheet/sha256:78666e341d0fe4d372d8b22d292be171cbd1da8421d6de29df1c97b0879d0210',
  digest: '78666e341d0fe4d372d8b22d292be171cbd1da8421d6de29df1c97b0879d0210',
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
