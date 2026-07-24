// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing release assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererVersion: 'faction-sheet-v4',
  supportedRendererVersions: ['faction-sheet-v4'],
  rendererId:
    'faction-sheet/sha256:3078da8169dbdf486800942fa6c47ce19771ad8c098291750bb54022e7f32482',
  digest: '3078da8169dbdf486800942fa6c47ce19771ad8c098291750bb54022e7f32482',
  contract: {
    rendererVersion: 'faction-sheet-v4',
    supportedRendererVersions: ['faction-sheet-v4'],
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
