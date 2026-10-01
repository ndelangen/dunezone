// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:7d45987f710cfef8f728ba8fbb4d4b2eafec97873eb4041090627ae214c3d5ce',
  digest: '7d45987f710cfef8f728ba8fbb4d4b2eafec97873eb4041090627ae214c3d5ce',
  components: {
    sources: '35c6eba19d62d1bd5fad9f21bc0ef1a10f562ec1ae8ebbd279613464fbf7e39a',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '03bc73ef91b07800e08ffb80c6d1d51f7616f989eca3061f3d7d516f8eb23813',
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
