// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:69ae6649261430b5c81c42601ed8382568d3685bf04e230bf3e130029d59b18f',
  digest: '69ae6649261430b5c81c42601ed8382568d3685bf04e230bf3e130029d59b18f',
  components: {
    sources: '21515b559a87ef3a471634a26d6e4ad0d7fd1bffd180c025ea566625712136c7',
    toolchain: '9d158f34747415c5f8934575924982b28e30fb14321b684bc426a030febe9f9e',
    code: '4174d234a6799a04689b68f459335eb7fe6a9bd4189d269b5a47f8f2dc2a679e',
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
