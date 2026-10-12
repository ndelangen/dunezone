// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:c9d618fb034e95ae9692286ac05f94f15f04570e22c11384564c1bd8286f15cf',
  digest: 'c9d618fb034e95ae9692286ac05f94f15f04570e22c11384564c1bd8286f15cf',
  components: {
    sources: 'bcb6a09f3bb5ffef2f7939d50adeaf596e028a3ea437745b998e0c599d5de001',
    toolchain: 'df737e1fef2f6e7574f2e8d81c31309df02e170b51ab18e8c5ef6498d23f17b1',
    code: '0328b40eba345a82bed0005dd4a6d6253880d352e968a5deef9684e28b8861e2',
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
