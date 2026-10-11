// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:be3d70a8254aacf51e9ba2fdad2c860eae4c78e3bb6202629aa620d6fde863a1',
  digest: 'be3d70a8254aacf51e9ba2fdad2c860eae4c78e3bb6202629aa620d6fde863a1',
  components: {
    sources: '5570b7126a626fc14cbf9d05b00ab4d1c279faaeb75d7056ae02f9f85c534d90',
    toolchain: 'f3a1b265a116b4fd4fe11cf401918ef561a9d8c134cb9ce21267698147960224',
    code: 'e10f7e771227b4c3b278d058d5043a72bc2ce68423d43c4e8aada8493a6c8618',
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
