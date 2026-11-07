// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:74ee613c12877727e33a512a751c6f340e78eda01f7c70045f39824abefb231f',
  digest: '74ee613c12877727e33a512a751c6f340e78eda01f7c70045f39824abefb231f',
  components: {
    sources: '763129f6c5e1a496d313a22e1f8be2114f412c996aa294daefdb023e02454890',
    toolchain: '4b1a8364fb23088a9ab4549586773825b88c6f66c2edf734bc7405ba5e72622b',
    code: '11c784c257130a07a730a2950d4eb7118d5293a9226e8b5a6f6b9a9c2850ffb4',
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
