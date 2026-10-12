// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:8d841e57f439768a17a472f3f284a0eef4a21d821603070d8dc1a0de4cc06a31',
  digest: '8d841e57f439768a17a472f3f284a0eef4a21d821603070d8dc1a0de4cc06a31',
  components: {
    sources: 'af4ddcee0b215eaf329d94cd635975f1ee9e95191468199d24f7c494acff8cf0',
    toolchain: 'd5d6fd729bc7032b4beb1053b2ae2ff5f5588039dfcae7b86de96c327aeae25e',
    code: 'f333986ccb45b97272afa71ea50f046b44bb9235a8b88bae255e7b81acf95d38',
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
