import { CAPTURE_PROTOCOL } from '@shared/asset-publishing/capture-protocol';
import { PUBLICATION_TARGETS } from '@shared/asset-publishing/publicationTargets';
import type { PublicationAssetType } from '@shared/asset-publishing/publicationTargets';
import { publisherErrorMessage } from '@shared/asset-publishing/publisher-diagnostics';
import { assertRequiredPublisherFonts } from '@shared/asset-publishing/publisher-fonts';
import { publisherCaptureSnapshotSchema } from '@shared/asset-publishing/publisher-snapshot';
import type { PublisherCaptureSnapshot } from '@shared/asset-publishing/publisher-snapshot';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { FactionSheetView } from '@app/print/sheet/FactionSheetView';
import { AssetRenderModeProvider } from '@game/assets/assetRenderMode';
import { CardBack } from '@game/assets/card/Back';
import { CustomToken } from '@game/assets/token/Custom';
import { RectangleToken } from '@game/assets/token/Rectangle';
import { TreacheryCard } from '@game/assets/treachery/Treachery';

import { afterPaint, ASSET_SETTLE_TIMEOUT_MS, settleHtmlImages, settleSvgResources } from './captureSettle';

type CaptureState = 'loading' | 'ready' | 'error';

/**
 * The one element an image capture is allowed to produce, at exactly the size the driver sets its viewport to.
 *
 * The geometry comes off the publication target rather than being restated here, so the frame and the viewport are the same pair of numbers.
 * That is what makes one CSS pixel one image pixel: nothing scales, nothing resamples, and the driver's bounds check is a real assertion rather than a restatement of what this file happened to render.
 */
function CaptureFrame({ assetType, children }: { assetType: PublicationAssetType; children: ReactNode }) {
  const { capture } = PUBLICATION_TARGETS[assetType];
  if (capture.output !== 'image') {
    throw new Error(`Publication asset type ${assetType} does not capture as an image`);
  }
  return (
    <div
      {...{ [CAPTURE_PROTOCOL.frameMarker.attribute]: '' }}
      style={{ width: capture.widthPx, height: capture.heightPx, overflow: 'hidden' }}
    >
      {children}
    </div>
  );
}

/**
 * What each Publication asset type draws, and what it needs of the document around it.
 *
 * `documentFlag` is a `data-` attribute set on `<html>` while the subject is mounted: the faction sheet neutralizes the app's page decoration that way, and an image capture wants none of it.
 */
type CaptureSubject = { documentFlag?: string; node: ReactNode };

function captureSubject(snapshot: PublisherCaptureSnapshot): CaptureSubject {
  switch (snapshot.assetType) {
    case 'faction_sheet':
      return {
        documentFlag: 'factionSheet',
        node: (
          <AssetRenderModeProvider mode="print">
            <FactionSheetView faction={snapshot.payload.faction} />
          </AssetRenderModeProvider>
        ),
      };
    case 'card-treachery':
      return {
        node: (
          <CaptureFrame assetType={snapshot.assetType}>
            <AssetRenderModeProvider mode="print">
              <TreacheryCard {...snapshot.payload.card} />
            </AssetRenderModeProvider>
          </CaptureFrame>
        ),
      };
    /*
     * A token face, already resolved by the producer, so this never asks which face it is drawing.
     * No `TokenFrame`: that is catalogue chrome and carries a drop shadow, and a JPEG cannot hold a mask anyway, so the published artifact is the renderer's own square face and a consumer masks it themselves.
     */
    case 'token-round':
    case 'token-gear':
    case 'token-square':
      return {
        node: (
          <CaptureFrame assetType={snapshot.assetType}>
            <AssetRenderModeProvider mode="print">
              <CustomToken
                background={snapshot.payload.face.background}
                image={snapshot.payload.face.image}
                circle={snapshot.payload.face.ring}
                top={snapshot.payload.face.top || undefined}
                bottom={
                  snapshot.payload.face.bottomFirst || snapshot.payload.face.bottomSecond
                    ? `${snapshot.payload.face.bottomFirst}\n${snapshot.payload.face.bottomSecond}`
                    : undefined
                }
                /* The renderer centres the symbol in a 300 unit box, so scale is expressed against its reference size, the same arithmetic the editor's proof uses. */
                size={{
                  width: 100 * snapshot.payload.face.symbolScale,
                  height: 100 * snapshot.payload.face.symbolScale,
                }}
              />
            </AssetRenderModeProvider>
          </CaptureFrame>
        ),
      };
    case 'token-rectangle':
      return {
        node: (
          <CaptureFrame assetType={snapshot.assetType}>
            <AssetRenderModeProvider mode="print">
              <RectangleToken {...snapshot.payload.face} />
            </AssetRenderModeProvider>
          </CaptureFrame>
        ),
      };
    /* A deck's face is its Cardback, drawn by the card renderer at the card's own size, so the frame is the card's frame. */
    case 'deck':
      return {
        node: (
          <CaptureFrame assetType={snapshot.assetType}>
            <AssetRenderModeProvider mode="print">
              <CardBack {...snapshot.payload.cardback} />
            </AssetRenderModeProvider>
          </CaptureFrame>
        ),
      };
  }
}

/**
 * The capture document, for every Publication asset type.
 *
 * It fetches the snapshot before it renders anything, which is what lets one page serve every type: the asset type arrives on the envelope, so by the time there is a subject to draw the page already knows what it is drawing.
 *
 * The marker below is the driver's only authority to capture.
 * It leaves `loading` exactly once, and only a `ready` marker carrying the exact payload hash is a licence to take bytes.
 */
export function PublisherCapture() {
  const [state, setState] = useState<CaptureState>('loading');
  const [detail, setDetail] = useState('Loading Publication job snapshot');
  const [snapshot, setSnapshot] = useState<PublisherCaptureSnapshot>();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(new Error('Timed out loading Publication job snapshot')),
      ASSET_SETTLE_TIMEOUT_MS
    );
    void (async () => {
      try {
        const response = await fetch(CAPTURE_PROTOCOL.paths.snapshot, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Publication job snapshot returned HTTP ${response.status}`);
        }
        const parsed = publisherCaptureSnapshotSchema.parse(await response.json());
        setSnapshot(parsed);
        setDetail(`Rendering Publication job snapshot ${parsed.payloadHash}`);
      } catch (error) {
        setState('error');
        setDetail(publisherErrorMessage(error));
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      controller.abort(new Error('Capture route unmounted'));
      window.clearTimeout(timeout);
    };
  }, []);

  const subject = snapshot ? captureSubject(snapshot) : undefined;
  const documentFlag = subject?.documentFlag;

  useEffect(() => {
    if (!documentFlag) {
      return;
    }
    document.documentElement.dataset[documentFlag] = '';
    return () => {
      delete document.documentElement.dataset[documentFlag];
    };
  }, [documentFlag]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(new Error('Timed out waiting for capture assets')),
      ASSET_SETTLE_TIMEOUT_MS
    );
    void (async () => {
      try {
        await afterPaint();
        await document.fonts.ready;
        await assertRequiredPublisherFonts(document.fonts);
        await settleHtmlImages(controller.signal);
        await settleSvgResources(controller.signal);
        if (!disposed && !controller.signal.aborted) {
          setState('ready');
          setDetail('Exact snapshot, fonts, HTML images, and SVG resources are ready');
        }
      } catch (error) {
        if (!disposed) {
          setState('error');
          setDetail(publisherErrorMessage(error));
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      disposed = true;
      controller.abort(new Error('Capture route unmounted'));
      window.clearTimeout(timeout);
    };
  }, [snapshot]);

  return (
    <>
      <output
        id={CAPTURE_PROTOCOL.marker.id}
        {...{
          [CAPTURE_PROTOCOL.marker.stateAttribute]: state,
          [CAPTURE_PROTOCOL.marker.payloadHashAttribute]: snapshot?.payloadHash,
        }}
        aria-live="polite"
        hidden
      >
        {detail}
      </output>
      {subject?.node}
    </>
  );
}
