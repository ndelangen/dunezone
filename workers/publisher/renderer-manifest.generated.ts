// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:68e71d790f92794cda98ee6555a9acb17fd5c6eabf1fecdb58dbe35b7661420d',
  digest: '68e71d790f92794cda98ee6555a9acb17fd5c6eabf1fecdb58dbe35b7661420d',
  components: {
    sources: '7f3e683b7e2cea7b4f7ebc832f88bddd76dc8f157b4f342e054d2412cb6fd7d2',
    toolchain: 'df38b3277de26c074c7b12763e5a5817e5c08c6940bd94f4e1e5c531dcf21b5b',
    code: 'fbba0cf6457937e0721a04a94b98eb675d2edc01f4d41898049d94b8477259bd',
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
