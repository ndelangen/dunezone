// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:fda257a0461e64684c9d359a66aa30e9a34e4697da415c8db82924afd73f4da5',
  digest: 'fda257a0461e64684c9d359a66aa30e9a34e4697da415c8db82924afd73f4da5',
  components: {
    sources: '1a72633a064f54e88ef9936c52780c49366d0e82bfcb2c8f473e081d1ea9b7fe',
    toolchain: '9d158f34747415c5f8934575924982b28e30fb14321b684bc426a030febe9f9e',
    code: 'f3497672425a7330f732a461281b8644c1ae2210c8fb9592c5878d025f7199be',
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
