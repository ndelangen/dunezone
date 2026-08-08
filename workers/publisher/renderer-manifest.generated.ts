// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:e0423f0849ceddf52c53766c71338cda92f399588ac8f295e5c62d306c2c4fa2',
  digest: 'e0423f0849ceddf52c53766c71338cda92f399588ac8f295e5c62d306c2c4fa2',
  components: {
    sources: 'f811d2ed7cf706b29553be7f60604548d6d5c9a74bb8b1ab838c914d9cb0c406',
    toolchain: 'bab222d4229402776633d8e13227f0cffe4ac4f1c77bcfa04d4d19d55144e2aa',
    code: 'e698ceb3695ec2f69996921ad3e78c710f9afaf2808edc19a6e855e524556c62',
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
