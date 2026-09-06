// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:76aacd0b45601e3ec1b8ea32ee2f785532da3ccfa58efd9c79ec7e26847b3894',
  digest: '76aacd0b45601e3ec1b8ea32ee2f785532da3ccfa58efd9c79ec7e26847b3894',
  components: {
    sources: '5289b6254320530ee857ff2912681e9d6a30135dbb3a92239296365f53397813',
    toolchain: 'e7e830225f6973a7d7e43aada3bcbcd5de3c169378aa25849d24d8de97ea517a',
    code: '2005775f6edef9b73398d6c51a04bb86c42fb2de80944ff3eb887df027b7a519',
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
