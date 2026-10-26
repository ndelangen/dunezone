// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:ab27f51ce929746bd97b4eb59db47224c429c5f70a5c2077c1a3e10399c74e45',
  digest: 'ab27f51ce929746bd97b4eb59db47224c429c5f70a5c2077c1a3e10399c74e45',
  components: {
    sources: 'd7438061a22477fbf843122611b0af7a9463ffeb02d76115527e05a69e86d306',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: '84bea7d31b29b628d64f6dc36362b26f4e3bb5d9714d824e696ea47a26b2b1c3',
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
