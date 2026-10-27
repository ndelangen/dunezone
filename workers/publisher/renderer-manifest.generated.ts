// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:d3faaa928462153ed3f3062896b3b642d4e32690eb0676b3afa6e461dd8459e0',
  digest: 'd3faaa928462153ed3f3062896b3b642d4e32690eb0676b3afa6e461dd8459e0',
  components: {
    sources: '990cf8864cc1446a622afb82a6bcc524645064bc03ce6ae96bbb71d1ff240fc7',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: '57f4da968a760e854e6e04196407ce142e886c3487995be4a006c4e5b905d083',
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
