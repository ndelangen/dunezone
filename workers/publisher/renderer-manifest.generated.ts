// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:ff2c1c35bd56f9f75687fbf4a94eda5db840feb3321871f68bf8fa0cb350e6ef',
  digest: 'ff2c1c35bd56f9f75687fbf4a94eda5db840feb3321871f68bf8fa0cb350e6ef',
  components: {
    sources: 'c9cc9ebfc66ade931cb5f904047bb69a819634483a5c1f2080c19ffe8d7962d0',
    toolchain: '4b1a8364fb23088a9ab4549586773825b88c6f66c2edf734bc7405ba5e72622b',
    code: '76d0dadb8f71197c9fc69da12b3f0f37f6fb75a3161f1b0e89559ab3cb1896ca',
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
