// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:08e78bad8886ab33e1ecf33e3250d88b92a8c94d03eb7c0b80461b939d4bba11',
  digest: '08e78bad8886ab33e1ecf33e3250d88b92a8c94d03eb7c0b80461b939d4bba11',
  components: {
    sources: '2e207e25e32a55c00dec489e11b5677bc49e5c9df84d1bc9e7c892ee99bbcf68',
    toolchain: 'f3a1b265a116b4fd4fe11cf401918ef561a9d8c134cb9ce21267698147960224',
    code: '56bceb2356b59b68be6564f6c9360c3f98133516f5f1af46cd3f2cb7fd5ce48c',
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
