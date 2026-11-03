// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:1dc4400bdc2337ce61fcfb7e8b9ba449c1cbfb247186d69f5f6990292c4186cb',
  digest: '1dc4400bdc2337ce61fcfb7e8b9ba449c1cbfb247186d69f5f6990292c4186cb',
  components: {
    sources: '42c28ea770d99320848c71fddac8e5e2de863ae7fb745085766ad995e5aa4f29',
    toolchain: 'b0d45ed96014b35a34d2af253bcd665fd542f7191afc5641d6013376c07e65b8',
    code: '73c4357d2a5c9cc254a705c21526f2da94d34f758054982566e451c3963d898c',
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
