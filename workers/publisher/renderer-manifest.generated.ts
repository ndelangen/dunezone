// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:6496d3e337308d4cc7552e728106f66ce05a8f673b4e9a3bd30c87c78a120f24',
  digest: '6496d3e337308d4cc7552e728106f66ce05a8f673b4e9a3bd30c87c78a120f24',
  components: {
    sources: '990cf8864cc1446a622afb82a6bcc524645064bc03ce6ae96bbb71d1ff240fc7',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: 'a0287bc99180c8f7c5f8672b7ecd51e646e5ec252418e3bf621e92e9edf45c71',
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
