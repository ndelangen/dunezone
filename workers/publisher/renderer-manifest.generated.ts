// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:42f5d6a37cd3bf8152e9cce630d5967e3ec927fbaed1580b3a86547550b42b04',
  digest: '42f5d6a37cd3bf8152e9cce630d5967e3ec927fbaed1580b3a86547550b42b04',
  components: {
    sources: '5570b7126a626fc14cbf9d05b00ab4d1c279faaeb75d7056ae02f9f85c534d90',
    toolchain: 'cd79fc1060769575db05a780ffe3aae68dd0faae114a15dae117b8a9ce1103d7',
    code: '93c377f44aa4a40e2c3ce1f5aa02ae2039314f97911b32455c73524559d33a95',
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
