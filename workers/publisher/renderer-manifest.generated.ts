// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererIdentity:
    'faction-sheet/sha256:48ee7ba2e7a648c7491d4e164121b3d4d1fdd2838e61c33f8e3958907d7c4f15',
  digest: '48ee7ba2e7a648c7491d4e164121b3d4d1fdd2838e61c33f8e3958907d7c4f15',
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
