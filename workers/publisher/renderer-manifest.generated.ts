// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:60e6936fe4065450628dd2969fbeea7f1fdd15dcb4ac584f5ed87ff951382c2a',
  digest: '60e6936fe4065450628dd2969fbeea7f1fdd15dcb4ac584f5ed87ff951382c2a',
  components: {
    sources: '952feeb5426ca24b1dcc815e4dc14cfec96fd6583d40c85aeaa28bb39cc195da',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: 'a3891254a5636be18fe1ce6c1d915116b3648cdca2af14b52a83e76a5e8c61a9',
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
