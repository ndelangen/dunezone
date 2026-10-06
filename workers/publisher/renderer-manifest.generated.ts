// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:55b26a6b5e0611f6b4d1c03009132ffac56f557e7e0ccd29018c84d8fc4b3edf',
  digest: '55b26a6b5e0611f6b4d1c03009132ffac56f557e7e0ccd29018c84d8fc4b3edf',
  components: {
    sources: 'edefa4e8ecc79276381d7abd3b4af83bf2313772e979daf61b27488e50bbf9e5',
    toolchain: '1b72a569d46b93089ef2ec6218a686ee27fda18c0e09e1396ad0aced9d2c8df3',
    code: 'f1f2434781d5fd159812b648508e5f07b97b24aa12f78bc70fc1cb008c746016',
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
