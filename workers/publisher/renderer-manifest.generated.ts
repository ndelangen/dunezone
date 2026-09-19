// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:2b0f69a1402eb99136783e0b41bbf40699810b5ab04eb48a387f1789ffebdb2b',
  digest: '2b0f69a1402eb99136783e0b41bbf40699810b5ab04eb48a387f1789ffebdb2b',
  components: {
    sources: 'dc42eb0ffc66348f7c303ae883a5928088deb7d12cd6c62c08345e1b41eb2952',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: 'f65afc62a62d3524f5d3589c4ba5773a5cfdc398dde2c70d09ea02ee9cabf8cb',
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
