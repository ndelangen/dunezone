// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:12d6061b51b3ca16c967237f1cd932f4e88b7648da7160424b1d67ee2b99d376',
  digest: '12d6061b51b3ca16c967237f1cd932f4e88b7648da7160424b1d67ee2b99d376',
  components: {
    sources: '6270218e30b2a35b17a16bd42a3adcb0f8f60c7f1b54900f6820e360a2a7e5a1',
    toolchain: '67ad00c8c99d48a0882a69ae162434248e4cdf0959217b3844c4c55287e95a88',
    code: 'a8a684a655f03fbd6ce67a9e10a46ecc32e6fbf36e8a357f395a221e4798cbbc',
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
