// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:7219efcb4f66bcd3c4caceca9dab1ecaa75addea5ca85e85901143487697983c',
  digest: '7219efcb4f66bcd3c4caceca9dab1ecaa75addea5ca85e85901143487697983c',
  components: {
    sources: '0cda921063c9d0cae6886e987cd18c69f09d07f631778b5d32f32111eef8286f',
    toolchain: '67ad00c8c99d48a0882a69ae162434248e4cdf0959217b3844c4c55287e95a88',
    code: '0689c1719c5b05386e1eb9eba38d246b3a38c2ab55a99526b96ea0f5f1b8dff4',
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
