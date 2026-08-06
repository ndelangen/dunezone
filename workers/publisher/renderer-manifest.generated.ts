// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererIdentity:
    'faction-sheet/sha256:9ec45c14e5e682be90c470afc2404cb7ec323e9ad00aee27e7e63ccbb42ad87f',
  digest: '9ec45c14e5e682be90c470afc2404cb7ec323e9ad00aee27e7e63ccbb42ad87f',
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
