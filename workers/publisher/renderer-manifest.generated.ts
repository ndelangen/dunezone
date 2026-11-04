// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:97952b7c32b6a64425ed8dc80c502c8cf1a525adcab1ae9420ead32c055248ed',
  digest: '97952b7c32b6a64425ed8dc80c502c8cf1a525adcab1ae9420ead32c055248ed',
  components: {
    sources: '4ca2b2823bbf8c343c2e6ac38dbd620c35cddf8f9293188968d28c0cdd78757d',
    toolchain: '9d158f34747415c5f8934575924982b28e30fb14321b684bc426a030febe9f9e',
    code: '34f3b992021a39061a3ceb90c9e895c3be62c9df4d6ae375c2a1afdf4dd741b0',
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
