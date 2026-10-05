// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:7c4a8822f129173b425b21ffa75d10588484dafbbb29593d6244d517f5306336',
  digest: '7c4a8822f129173b425b21ffa75d10588484dafbbb29593d6244d517f5306336',
  components: {
    sources: '68bde6d093fc9c73f00e671d37c524f662388279009b7c539acccc01af66f0a5',
    toolchain: 'df38b3277de26c074c7b12763e5a5817e5c08c6940bd94f4e1e5c531dcf21b5b',
    code: '6a84b2a39c2a35966ad082f4a6ee5768461fbc79adf4efbd25947a688e75d552',
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
