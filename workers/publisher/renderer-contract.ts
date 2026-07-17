import {
  CURRENT_FACTION_SHEET_RENDERER_VERSION,
  SUPPORTED_FACTION_SHEET_RENDERER_VERSIONS,
} from '../../src/app/capture/faction-sheet-renderer-versions';

export const PUBLISHER_RENDERER_VERSION = CURRENT_FACTION_SHEET_RENDERER_VERSION;
export const PUBLISHER_SUPPORTED_RENDERER_VERSIONS = SUPPORTED_FACTION_SHEET_RENDERER_VERSIONS;

export const PUBLISHER_RENDERER_CONTRACT = {
  rendererVersion: PUBLISHER_RENDERER_VERSION,
  supportedRendererVersions: PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
  viewport: { width: 2_100, height: 2_970, deviceScaleFactor: 1 },
  pdf: {
    pageCount: 2,
    pageWidthMm: 210,
    pageHeightMm: 297,
    pageSizeToleranceMm: 0.5,
    displayHeaderFooter: false,
    marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCssPageSize: true,
    printBackground: true,
  },
} as const;
