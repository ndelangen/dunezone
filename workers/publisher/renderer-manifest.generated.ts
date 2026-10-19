// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:0e21d079ccd528e1de2e0412b1731072cda02f101de2f9b07241c6fa8321af41',
  digest: '0e21d079ccd528e1de2e0412b1731072cda02f101de2f9b07241c6fa8321af41',
  components: {
    sources: '047983571d8252a4ea3344021f1aa3006300e2d86761cffd855fe037726aa1d9',
    toolchain: '1c9ac03aed0c51bdbcf307b77cfcaeb9efa8a682fb79c40f817c522bdd88ec6c',
    code: 'be48daf7b997b89456f9d3f912afc86a49aa08cc1d43097a53a72d5dcf2843cf',
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
