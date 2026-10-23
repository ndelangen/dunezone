// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:6b10772ac4ffea7be721d3bba2696bf55622934fbb5f3feb1f82d70180f1d005',
  digest: '6b10772ac4ffea7be721d3bba2696bf55622934fbb5f3feb1f82d70180f1d005',
  components: {
    sources: '8637c7f5fc4b6d70625fc622d509a34a8de284cf3c091b8c616d7c3512eb0ca0',
    toolchain: '1c9ac03aed0c51bdbcf307b77cfcaeb9efa8a682fb79c40f817c522bdd88ec6c',
    code: 'f887c62abe72a2309d84a185cc55cc1c7856945b3e340e4df3f8f17ea146f233',
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
