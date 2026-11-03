// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:26c68bd69c63a4170056efca3d0c824e04c8a607d74a26eefa9b6e9fed8cd3b2',
  digest: '26c68bd69c63a4170056efca3d0c824e04c8a607d74a26eefa9b6e9fed8cd3b2',
  components: {
    sources: '90969c7a1906d2e9726da84bf18593ec9eaea358a5d3f19d49a7e972f144010c',
    toolchain: 'df7288c5062038eb672a31ccbbf765effaa626c1f9d4898069a5dedae3592acb',
    code: '6f09f50603b4f082a6ff7ebaa2bf1460b1c1d96c65190d29f6b134990bc19a14',
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
