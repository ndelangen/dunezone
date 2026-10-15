// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:f3ce99b6bb51b92eb2795ee691681fb496fb10898eaba929ca4d496d259e8ac5',
  digest: 'f3ce99b6bb51b92eb2795ee691681fb496fb10898eaba929ca4d496d259e8ac5',
  components: {
    sources: '8ebbff8465410bdc5b24e52a1f9cde0bc4e735e5ab47eda797ea0f23a6f5564f',
    toolchain: '526046ccc7156d11eecbb5e983c1e38a56e1c3cb022aac1a7483ecf849e5fec2',
    code: 'e62af6e367b93fcd81f5d106bc4646fd8a06c3247aa36625fe5f7735c61cb425',
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
