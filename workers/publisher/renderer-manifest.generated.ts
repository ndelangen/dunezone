// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:59baec1db35d8764e0b3ac9fbf551daa0da86e6de0100caaa46dcb546d2ec2a3',
  digest: '59baec1db35d8764e0b3ac9fbf551daa0da86e6de0100caaa46dcb546d2ec2a3',
  components: {
    sources: 'eaa718a268df921f852db5d3cf37afb21c0fd8ae5c0bd87b7e42a62a6421ad73',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '08a99bd1de82274521c5ed4e3d4d5cb689eb3ef8e52a463a3fda3b7e0e1890b3',
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
