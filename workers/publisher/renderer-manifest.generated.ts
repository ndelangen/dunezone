// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:36fd2de1c953b0bfe34a8bd41e562efda9ca036d443625dfb54ee0c147fc4931',
  digest: '36fd2de1c953b0bfe34a8bd41e562efda9ca036d443625dfb54ee0c147fc4931',
  components: {
    sources: '5289b6254320530ee857ff2912681e9d6a30135dbb3a92239296365f53397813',
    toolchain: '862154f6813aeaa0fd73c238ef8c80b979c289b6a9da8685e2495cf86586e9ed',
    code: 'abacecbb2159d7b4038a6c6de80f81635e493d68242d7daa247a780f001bf8ad',
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
