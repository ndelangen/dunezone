// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing release assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererVersion: 'faction-sheet-v2',
  supportedRendererVersions: ['faction-sheet-v1', 'faction-sheet-v2'],
  rendererId:
    'faction-sheet/sha256:482666a6a20c74471bdb521873c09aa927affba21ad7dddd62659ffc58560c85',
  digest: '482666a6a20c74471bdb521873c09aa927affba21ad7dddd62659ffc58560c85',
  contract: {
    rendererVersion: 'faction-sheet-v2',
    supportedRendererVersions: ['faction-sheet-v1', 'faction-sheet-v2'],
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
