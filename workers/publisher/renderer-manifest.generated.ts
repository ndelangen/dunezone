// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:ae3991a90a5906bd015f4bfd1a626e1df69422e5d3b1f3dd7ee123d175387ab1',
  digest: 'ae3991a90a5906bd015f4bfd1a626e1df69422e5d3b1f3dd7ee123d175387ab1',
  components: {
    sources: '4ca2b2823bbf8c343c2e6ac38dbd620c35cddf8f9293188968d28c0cdd78757d',
    toolchain: '9d158f34747415c5f8934575924982b28e30fb14321b684bc426a030febe9f9e',
    code: '045ed2b1472e438f05231d710eb7a366f58355cb9800ed2400c2df552d7a7c7d',
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
