// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:df396e21bbf3aedfb16ecda203088683b099bbc5b6c3e4877475a88b82586b36',
  digest: 'df396e21bbf3aedfb16ecda203088683b099bbc5b6c3e4877475a88b82586b36',
  components: {
    sources: '84cef58ef00aedc1f2586420823f0b372db2c707ba20fb48b6d9d0abda717baf',
    toolchain: '526046ccc7156d11eecbb5e983c1e38a56e1c3cb022aac1a7483ecf849e5fec2',
    code: 'bae8f17182bcb846d0747ffc0b6d788229a4fbadff0d99b2e38b57dfd3ca8ea9',
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
