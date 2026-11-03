// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:486cd70d6feceafff30f591bfdec25d50b41df5e1fed79b75c3091635e864a84',
  digest: '486cd70d6feceafff30f591bfdec25d50b41df5e1fed79b75c3091635e864a84',
  components: {
    sources: '42c28ea770d99320848c71fddac8e5e2de863ae7fb745085766ad995e5aa4f29',
    toolchain: '4ae0fb7bdcea7d7c9ec7d058160a4b8146b57d36e247451fa0f82b57e716e64e',
    code: '5da60b00eac8eea86a5a0c843a836fde8070cfeb5947f8c4b7a1b09821c5d8f9',
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
