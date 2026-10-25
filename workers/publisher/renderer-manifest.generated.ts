// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:da76edf05774682a6115aee0135302532af84217f51f3c1eb7300ac1cacc0432',
  digest: 'da76edf05774682a6115aee0135302532af84217f51f3c1eb7300ac1cacc0432',
  components: {
    sources: 'c9465074d54d41286bdfac47d4e2f36d898b778bb20b70edfcdfc355b4077404',
    toolchain: '1c9ac03aed0c51bdbcf307b77cfcaeb9efa8a682fb79c40f817c522bdd88ec6c',
    code: 'f8608e1fcdc6f9f3fa3e945d6d7b4b668ee5432d46202ec8d0dcb8ab28943fe9',
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
