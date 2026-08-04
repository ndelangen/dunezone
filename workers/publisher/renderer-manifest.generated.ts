// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererIdentity:
    'faction-sheet/sha256:0fca0d9c2d21ceacffcaa0a7d1db91d3e5e1da85694cd75284a5cf5a667830a7',
  digest: '0fca0d9c2d21ceacffcaa0a7d1db91d3e5e1da85694cd75284a5cf5a667830a7',
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
