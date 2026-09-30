// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:5bb5ce20d93bbb87c91e4fd21150c8f2e2be2e3b26aa9a515eb623b55c4a305e',
  digest: '5bb5ce20d93bbb87c91e4fd21150c8f2e2be2e3b26aa9a515eb623b55c4a305e',
  components: {
    sources: '7cf1453c24b30513ad79cb3c60a7581ff3497883edcafc6f0c9d6351277eecda',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: 'a77b69d50dadc54b5b04b779da24d73cd8044c8ba3ba255feec8dde359ecd6dd',
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
