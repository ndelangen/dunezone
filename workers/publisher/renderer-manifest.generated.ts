// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:f7156bccf864e59835f71b97d8eac73fe7160d3371c27a17f51dd43836e6658e',
  digest: 'f7156bccf864e59835f71b97d8eac73fe7160d3371c27a17f51dd43836e6658e',
  components: {
    sources: '42c28ea770d99320848c71fddac8e5e2de863ae7fb745085766ad995e5aa4f29',
    toolchain: 'df7288c5062038eb672a31ccbbf765effaa626c1f9d4898069a5dedae3592acb',
    code: '5da60b00eac8eea86a5a0c843a836fde8070cfeb5947f8c4b7a1b09821c5d8f9',
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
