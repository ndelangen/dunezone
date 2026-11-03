// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:def2e755b49df92bef34f4891c2a5cb70c5517ada1a1fc9a479aede17ee3153e',
  digest: 'def2e755b49df92bef34f4891c2a5cb70c5517ada1a1fc9a479aede17ee3153e',
  components: {
    sources: 'f7428e910e0b7cbe292884f71bdd1031e2e8f8d4629a4b737957958899da9800',
    toolchain: '37e64dd78013476fba4712e5dbf6a6e31c8fa627934770eb0f63ef984336c3c4',
    code: 'f4a418fbd84224f7aa8818fedf2e3a7e7edecd20a3afbf025ee99166b9b5c6a3',
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
