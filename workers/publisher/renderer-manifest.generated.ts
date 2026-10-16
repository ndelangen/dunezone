// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:10f9d909f5308d284d1e03cfbb3f2ef02a75613b5ca6fef2fa0ce7738fb8a660',
  digest: '10f9d909f5308d284d1e03cfbb3f2ef02a75613b5ca6fef2fa0ce7738fb8a660',
  components: {
    sources: '8ebbff8465410bdc5b24e52a1f9cde0bc4e735e5ab47eda797ea0f23a6f5564f',
    toolchain: '526046ccc7156d11eecbb5e983c1e38a56e1c3cb022aac1a7483ecf849e5fec2',
    code: '6de9292e3388b6f7c38090129c879b0813a790399724b211463db48fa81b7496',
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
