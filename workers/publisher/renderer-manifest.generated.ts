// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:91ee7b6f1327649cc3b141023cfdd6aa8258e2b5f0c8dd2a5d067c310b770ccf',
  digest: '91ee7b6f1327649cc3b141023cfdd6aa8258e2b5f0c8dd2a5d067c310b770ccf',
  components: {
    sources: '9b7613518391d47961254c031cccd9de0dca17c590b0023a9c2d6c4f375f7523',
    toolchain: 'f4c69d90dcb347d91cc47266b21853233aee418d21bfd8804e654b9121022db4',
    code: '720c6eff1f0ee8b6fbf46b7b890333ca8ec1ba6907a4c9fce96df701fed0e0c4',
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
