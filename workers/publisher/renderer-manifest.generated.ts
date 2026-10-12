// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:0309db373ebca59f8c073c5b4af64f83696f15c664c81a779eaf98d41a8060ab',
  digest: '0309db373ebca59f8c073c5b4af64f83696f15c664c81a779eaf98d41a8060ab',
  components: {
    sources: '04c304874ac40df0c6b0df44d98fd8847c0dabb7d82ddc16a9498725039439c1',
    toolchain: 'df737e1fef2f6e7574f2e8d81c31309df02e170b51ab18e8c5ef6498d23f17b1',
    code: '878c0980097ad449a5fe67b3b0a9c2fb2734c4d6fcf15f32085030fcb3825397',
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
