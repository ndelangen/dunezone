// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:dafb2975ae74a6179a48a6c27cfa9f20460dd563908161ee923dec48edd62f12',
  digest: 'dafb2975ae74a6179a48a6c27cfa9f20460dd563908161ee923dec48edd62f12',
  components: {
    sources: '5289b6254320530ee857ff2912681e9d6a30135dbb3a92239296365f53397813',
    toolchain: 'a9d66c69040fffeadd0766d2a37756f785d33b1b7240d1bda5d6eeb081dd51ab',
    code: '21503ed1684fa6354b89b16136c4edf0f87466553f91861da7a08b9767ef57fd',
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
