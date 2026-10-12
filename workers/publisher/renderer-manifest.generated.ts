// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:71012abe9c1dd8ecf8ad88de31a6adc627dce664228223f57d39461d644abcae',
  digest: '71012abe9c1dd8ecf8ad88de31a6adc627dce664228223f57d39461d644abcae',
  components: {
    sources: '88c011d4b6a4b7302dafb30624ded0cc889cafec51a0a7bb318e591b48d1287b',
    toolchain: 'd5d6fd729bc7032b4beb1053b2ae2ff5f5588039dfcae7b86de96c327aeae25e',
    code: 'd0f0d68e84562e961d7e2feb4d7232d0e4d02ae808f2721a33d780c175a4d031',
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
