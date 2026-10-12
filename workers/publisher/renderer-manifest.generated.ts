// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:63af0daf9881b72265917801a3ce352923187cc7b85b3cf83c4e2b32c1a7e272',
  digest: '63af0daf9881b72265917801a3ce352923187cc7b85b3cf83c4e2b32c1a7e272',
  components: {
    sources: '04c304874ac40df0c6b0df44d98fd8847c0dabb7d82ddc16a9498725039439c1',
    toolchain: 'df737e1fef2f6e7574f2e8d81c31309df02e170b51ab18e8c5ef6498d23f17b1',
    code: 'd42b22aa9b6c813f62334f98e815bd9ec66882cf5061f930b2dcc4006ebe723e',
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
