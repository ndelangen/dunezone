// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:f0fd1bc5b93e3744c6b9ede67c44cb19850300620c4e95a202dc48cd5e58fc3a',
  digest: 'f0fd1bc5b93e3744c6b9ede67c44cb19850300620c4e95a202dc48cd5e58fc3a',
  components: {
    sources: 'bb28f5eda63d8eba7f0bf7fde0e66e844d44abe4332310bde4bc60bccba6e169',
    toolchain: '1c9ac03aed0c51bdbcf307b77cfcaeb9efa8a682fb79c40f817c522bdd88ec6c',
    code: 'fa65c29d9fe1d017a272782cea6cbc519a95bb4aadbe61f34f9881cb0620c425',
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
