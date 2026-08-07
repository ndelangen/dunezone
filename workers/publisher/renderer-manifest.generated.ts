// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:2f63741d56d604a9c888a30ecd8a33d5981f769d9061505230dbc3099e8b47d0',
  digest: '2f63741d56d604a9c888a30ecd8a33d5981f769d9061505230dbc3099e8b47d0',
  components: {
    sources: 'f811d2ed7cf706b29553be7f60604548d6d5c9a74bb8b1ab838c914d9cb0c406',
    toolchain: 'bab222d4229402776633d8e13227f0cffe4ac4f1c77bcfa04d4d19d55144e2aa',
    code: 'da94a5a355d27941aaf239e46ab53793ca7c3a07952123c092cfedfe4d047f13',
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
