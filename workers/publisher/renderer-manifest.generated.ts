// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:263d62097b2307a4c64de7de80b82bbeb77f92a5fbbc31abfa89c3a772c86bb8',
  digest: '263d62097b2307a4c64de7de80b82bbeb77f92a5fbbc31abfa89c3a772c86bb8',
  components: {
    sources: '8ebbff8465410bdc5b24e52a1f9cde0bc4e735e5ab47eda797ea0f23a6f5564f',
    toolchain: '526046ccc7156d11eecbb5e983c1e38a56e1c3cb022aac1a7483ecf849e5fec2',
    code: 'a89e53e42c26a19b501a329b48cb8186629f6282dfd641df3cc0681139cc1dd5',
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
