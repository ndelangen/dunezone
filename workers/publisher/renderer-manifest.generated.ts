// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:a6c851b37e4d3778eb78e773b63ffc42d8fc954d31d575942e0fa918835d64a8',
  digest: 'a6c851b37e4d3778eb78e773b63ffc42d8fc954d31d575942e0fa918835d64a8',
  components: {
    sources: 'ab88c045cbf366af4309af7e210320c9536c12f4a5dc63df2ff2e3df6bf24a54',
    toolchain: 'df737e1fef2f6e7574f2e8d81c31309df02e170b51ab18e8c5ef6498d23f17b1',
    code: 'a751d251a51590b3709edaeff595a0816c9a70f333a29e525f88ae3546fce7d3',
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
