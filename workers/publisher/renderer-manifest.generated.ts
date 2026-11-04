// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:3ee9c230c38f1149b57db414e1656ee6e96611027b38c2437be89bfb03e75986',
  digest: '3ee9c230c38f1149b57db414e1656ee6e96611027b38c2437be89bfb03e75986',
  components: {
    sources: '4ca2b2823bbf8c343c2e6ac38dbd620c35cddf8f9293188968d28c0cdd78757d',
    toolchain: '9d158f34747415c5f8934575924982b28e30fb14321b684bc426a030febe9f9e',
    code: '4d4407193bf03c1e242c9c80ec40c29250578a62f3a5d64d1cd0e9a85f4ff4c4',
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
