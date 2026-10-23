// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:8a689f55d40d8ddd4dff8e1cfb2f012168d971e3d6cac952bba3efa226e9bf50',
  digest: '8a689f55d40d8ddd4dff8e1cfb2f012168d971e3d6cac952bba3efa226e9bf50',
  components: {
    sources: 'e21a26a3b4f0cb3f2e80f785b9e2a4c559f01e4eef32d501e5adfa3b5f7d6c1a',
    toolchain: '1c9ac03aed0c51bdbcf307b77cfcaeb9efa8a682fb79c40f817c522bdd88ec6c',
    code: '7040d04040462fb257f4dc05c23db290a56b05092b7d3cffaaa1d3706d33a4d6',
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
