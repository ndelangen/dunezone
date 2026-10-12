// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:a002b6cc29e9702b7db6cfab9705ed97dbc1dfed1324903a5cc76472d9b0a661',
  digest: 'a002b6cc29e9702b7db6cfab9705ed97dbc1dfed1324903a5cc76472d9b0a661',
  components: {
    sources: '88c011d4b6a4b7302dafb30624ded0cc889cafec51a0a7bb318e591b48d1287b',
    toolchain: 'd5d6fd729bc7032b4beb1053b2ae2ff5f5588039dfcae7b86de96c327aeae25e',
    code: '9ebd9f5a746a40771a22cafae5e79f58468dc6e424e5a0d663ffb92ff30729b0',
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
