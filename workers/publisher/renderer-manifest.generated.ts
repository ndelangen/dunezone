// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererIdentity:
    'faction-sheet/sha256:1769e860859e8fc6d0413807bc5d3de49dbb8135e419ba9f509fd5657b67a842',
  digest: '1769e860859e8fc6d0413807bc5d3de49dbb8135e419ba9f509fd5657b67a842',
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
