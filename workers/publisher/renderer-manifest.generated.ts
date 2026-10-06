// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:5b0a215e1fab227790eb5a0c60e3943fb209a4920bebd9f1e89eee8ddb5bee08',
  digest: '5b0a215e1fab227790eb5a0c60e3943fb209a4920bebd9f1e89eee8ddb5bee08',
  components: {
    sources: 'edefa4e8ecc79276381d7abd3b4af83bf2313772e979daf61b27488e50bbf9e5',
    toolchain: '1b72a569d46b93089ef2ec6218a686ee27fda18c0e09e1396ad0aced9d2c8df3',
    code: '1b6cb5b020d52d1cde3ee3cf6a8557129fe90cd79b1f72f7ebbb0b00d2dda3c7',
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
