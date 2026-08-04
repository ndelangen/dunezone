// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
export const rendererManifest = {
  schemaVersion: 1,
  rendererIdentity:
    'faction-sheet/sha256:5132c7f42432d0766effc6b4d42a47c8916d979286efb57b832b400a0a14f9de',
  digest: '5132c7f42432d0766effc6b4d42a47c8916d979286efb57b832b400a0a14f9de',
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
