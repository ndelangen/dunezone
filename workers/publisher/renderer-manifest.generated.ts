// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:7a45f5c95bb4d71cb1fea8d20fbdfb8f1a22820eaaf93c51a304297f15fdb91a',
  digest: '7a45f5c95bb4d71cb1fea8d20fbdfb8f1a22820eaaf93c51a304297f15fdb91a',
  components: {
    sources: '5289b6254320530ee857ff2912681e9d6a30135dbb3a92239296365f53397813',
    toolchain: '027e3955ad0c9a9450a11937e69417290fd8ee9961eb49bd8485a349a65cb370',
    code: '43cb08dccbc0c16019b4bbf45b103f181c2cd3cdb089889152ca6b525e42d5a1',
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
