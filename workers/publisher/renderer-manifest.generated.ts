// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:87c60dd1f9841faf23e2892ec14c22f1726733043b88266c597452ac3ee234f5',
  digest: '87c60dd1f9841faf23e2892ec14c22f1726733043b88266c597452ac3ee234f5',
  components: {
    sources: 'b2e16c2ba8800e3dabc70e03e307084caada9491e061f487803dd5c9f1302c86',
    toolchain: '1c9ac03aed0c51bdbcf307b77cfcaeb9efa8a682fb79c40f817c522bdd88ec6c',
    code: '10857c94a7506d04a8872dead3dc47a5a14ab3ffb4a1f445bb4fc8f27bc35824',
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
