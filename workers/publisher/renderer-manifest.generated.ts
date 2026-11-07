// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:fd70d307ccb79c7f0f5d3b645e9be46a6a3f568a874236568c9ffb49c2717b28',
  digest: 'fd70d307ccb79c7f0f5d3b645e9be46a6a3f568a874236568c9ffb49c2717b28',
  components: {
    sources: '763129f6c5e1a496d313a22e1f8be2114f412c996aa294daefdb023e02454890',
    toolchain: '4b1a8364fb23088a9ab4549586773825b88c6f66c2edf734bc7405ba5e72622b',
    code: '38bbf4be2c1092f6a741738ac16d55f2efec42560c4cd87d863615563d6a858b',
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
