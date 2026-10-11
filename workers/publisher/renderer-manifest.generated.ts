// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:3578878257fa83bdfcab53678345cb73b99ec1d5f3af985f51c5b53bed2aa7dd',
  digest: '3578878257fa83bdfcab53678345cb73b99ec1d5f3af985f51c5b53bed2aa7dd',
  components: {
    sources: '5570b7126a626fc14cbf9d05b00ab4d1c279faaeb75d7056ae02f9f85c534d90',
    toolchain: 'f3a1b265a116b4fd4fe11cf401918ef561a9d8c134cb9ce21267698147960224',
    code: 'fbc639896838610a070d1925955f9131151ed382aa68b2cba2b2d73572a5ac4d',
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
