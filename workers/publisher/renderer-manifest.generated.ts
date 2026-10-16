// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:c8a33392aa6f08f6a730b64ac9a25f59bbbc6dd6b51f80b92f34ddef48a94ca2',
  digest: 'c8a33392aa6f08f6a730b64ac9a25f59bbbc6dd6b51f80b92f34ddef48a94ca2',
  components: {
    sources: 'e70f4d5696ca3e72f9e96a7c3005418d92f783dd594d8a51daff926d75ddf48e',
    toolchain: '526046ccc7156d11eecbb5e983c1e38a56e1c3cb022aac1a7483ecf849e5fec2',
    code: '7c199702fecba9388be7c2d89aa9dd5a459a2e60096a039a51abf502afe6c77d',
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
