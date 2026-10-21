import { CAPTURE_PROTOCOL } from '@shared/asset-publishing/capture-protocol';
import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { COMPONENT_GEOMETRY_PROTOCOL, isComponentAssetType } from '@shared/asset-publishing/componentGeometry';
import type { PublicationAssetType } from '@shared/asset-publishing/publicationTargets';
import { resolvePublicationCapture } from '@shared/asset-publishing/publicationTargets';
import { publisherErrorMessage } from '@shared/asset-publishing/publisher-diagnostics';
import { assertRequiredPublisherFonts } from '@shared/asset-publishing/publisher-fonts';
import type { PublisherCaptureSnapshot } from '@shared/asset-publishing/publisher-snapshot';
import { publisherCaptureSnapshotSchema } from '@shared/asset-publishing/publisher-snapshot';
import { tokenShapeOfType } from '@shared/assets/tokenOutline';
import type { RulebookSize } from '@shared/rulebooks/settings';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { FactionSheetView } from '@app/print/sheet/FactionSheetView';
import { AssetRenderModeProvider } from '@game/assets/assetRenderMode';
import { BoardMap } from '@game/assets/board/Board';
import { CardBack } from '@game/assets/card/Back';
import { CustomCard } from '@game/assets/card/Custom';
import { HomeworldCard } from '@game/assets/card/Homeworld';
import { LeaderSkillCard } from '@game/assets/card/LeaderSkill';
import { NexusCard } from '@game/assets/card/Nexus';
import { SpiceCard } from '@game/assets/card/Spice';
import { StormCard } from '@game/assets/card/Storm';
import { StrongholdCard } from '@game/assets/card/Stronghold';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { CustomToken } from '@game/assets/token/Custom';
import { RectangleToken } from '@game/assets/token/Rectangle';
import { tokenFaceProps } from '@game/assets/token/tokenFace';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { settleCardTitles } from '@game/assets/utils/cardTitleFit';
import { RulebookDocumentRenderer, RulebookPageRenderer } from '@game/rulebook/RulebookRenderer';

import { afterPaint, ASSET_SETTLE_TIMEOUT_MS, settleHtmlImages, settleSvgResources } from './captureSettle';
import { measureComponentGeometry } from './componentGeometry';

type CaptureState = 'loading' | 'ready' | 'error';

/**
 * The one element an image capture is allowed to produce, at exactly the size the driver sets its viewport to.
 *
 * The geometry comes off the publication target rather than being restated here, so the frame and the viewport are the same pair of numbers.
 * That is what makes one CSS pixel one image pixel: nothing scales, nothing resamples, and the driver's bounds check is a real assertion rather than a restatement of what this file happened to render.
 */
function CaptureFrame({
  assetType,
  size,
  children,
}: {
  assetType: PublicationAssetType;
  size?: RulebookSize;
  children: ReactNode;
}) {
  const capture = resolvePublicationCapture(assetType, size);
  if (capture.output !== 'image') {
    throw new Error(`Publication asset type ${assetType} does not capture as an image`);
  }
  return (
    <div
      {...{ [CAPTURE_PROTOCOL.frameMarker.attribute]: '' }}
      data-rulebook-size={size}
      style={{ width: capture.widthPx, height: capture.heightPx, overflow: 'hidden' }}
    >
      {children}
    </div>
  );
}

/** An image subject: the renderer in print mode, inside a frame at the type's capture size. */
function printedImage(assetType: PublicationAssetType, node: ReactNode): CaptureSubject {
  return {
    node: (
      <CaptureFrame assetType={assetType}>
        <AssetRenderModeProvider mode="print">{node}</AssetRenderModeProvider>
      </CaptureFrame>
    ),
  };
}

/**
 * What each Publication asset type draws, and what it needs of the document around it.
 *
 * `documentFlag` is a `data-` attribute set on `<html>` while the subject is mounted: the faction sheet neutralizes the app's page decoration that way, and an image capture wants none of it.
 * `title` is the document title while it is mounted, which Chromium writes into a PDF as its title, the name search engines show for the file.
 */
type CaptureSubject = { documentFlag?: string; title?: string; node: ReactNode };

function captureSubject(snapshot: PublisherCaptureSnapshot): CaptureSubject {
  switch (snapshot.assetType) {
    case 'board':
      return printedImage('board', <BoardMap board={snapshot.payload.board} />);
    case 'faction_sheet':
      return {
        documentFlag: 'factionSheet',
        /* The site's title grammar, as the faction's own page reads "Atreides · Custom faction · Dune Zone". */
        title: `${snapshot.payload.faction.name.trim() || 'Faction'} · Faction sheet · Dune Zone`,
        node: (
          <AssetRenderModeProvider mode="print">
            <FactionSheetView faction={snapshot.payload.faction} />
          </AssetRenderModeProvider>
        ),
      };
    case 'card-leaderability':
      return printedImage(
        snapshot.assetType,
        <LeaderSkillCard {...snapshot.payload.card} frontStyle={snapshot.payload.frontPreset?.style} />
      );
    case 'card-treachery':
      return printedImage(
        snapshot.assetType,
        <TreacheryCard {...snapshot.payload.card} frontStyle={snapshot.payload.frontPreset?.style} />
      );
    case 'card-homeworld':
      return printedImage(
        snapshot.assetType,
        <HomeworldCard {...snapshot.payload.card} frontStyle={snapshot.payload.frontPreset?.style} />
      );
    case 'card-nexus':
      return printedImage(
        snapshot.assetType,
        <NexusCard {...snapshot.payload.card} frontStyle={snapshot.payload.frontPreset?.style} />
      );
    case 'card-stronghold':
      return printedImage(
        snapshot.assetType,
        <StrongholdCard {...snapshot.payload.card} frontStyle={snapshot.payload.frontPreset?.style} />
      );
    case 'card-custom':
      return printedImage(
        snapshot.assetType,
        <CustomCard
          {...snapshot.payload.card}
          frontStyle={snapshot.payload.frontPreset?.style}
          tokens={snapshot.payload.tokens}
        />
      );
    case 'card-storm':
      return printedImage(
        snapshot.assetType,
        <StormCard
          {...snapshot.payload.card}
          frontStyle={snapshot.payload.frontPreset?.style}
          tokens={snapshot.payload.tokens}
        />
      );
    case 'card-spice':
      return printedImage(
        snapshot.assetType,
        <SpiceCard
          {...snapshot.payload.card}
          frontStyle={snapshot.payload.frontPreset?.style}
          boardDefinition={snapshot.payload.board}
          boardTokens={snapshot.payload.tokens}
        />
      );
    case 'faction-token':
      return printedImage(snapshot.assetType, <FactionToken {...snapshot.payload} />);
    case 'faction-troop':
      return printedImage(
        snapshot.assetType,
        <TroopToken
          image={snapshot.payload.image}
          background={snapshot.payload.background}
          star={snapshot.payload.star}
          hue={snapshot.payload.hue}
          striped={snapshot.payload.striped}
        />
      );
    case 'faction-traitor':
      return printedImage(snapshot.assetType, <TraitorCard {...snapshot.payload} />);
    case 'faction-alliance':
      return printedImage(snapshot.assetType, <AllianceCard {...snapshot.payload} />);
    case 'faction-leader':
      return printedImage(
        snapshot.assetType,
        <LeaderToken
          {...snapshot.payload.leader}
          background={snapshot.payload.background}
          logo={snapshot.payload.logo}
        />
      );
    case 'token-leader':
      return printedImage(snapshot.assetType, <LeaderToken {...snapshot.payload.leader} />);
    /*
     * A token face, already resolved by the producer, so this never asks which face it is drawing.
     * No `TokenFrame`: that is catalogue chrome and carries a drop shadow, and a JPEG cannot hold a mask anyway, so the published artifact is the renderer's own square face and a consumer masks it themselves.
     */
    case 'token-disc':
    case 'token-tech':
    case 'token-pointer':
    case 'token-plate':
      return printedImage(
        snapshot.assetType,
        <CustomToken
          shape={tokenShapeOfType(snapshot.assetType) ?? 'round'}
          {...tokenFaceProps(snapshot.payload.face)}
        />
      );
    case 'token-enhance':
      return printedImage(snapshot.assetType, <RectangleToken {...snapshot.payload.face} />);
    /* A deck's face is its Cardback, drawn by the card renderer at the card's own size, so the frame is the card's frame. */
    case 'cardback-preset':
    case 'deck':
      return printedImage(snapshot.assetType, <CardBack {...snapshot.payload.cardback} />);
    case 'rulebook-first-page':
      return {
        node: (
          <CaptureFrame assetType={snapshot.assetType} size={snapshot.payload.settings.size}>
            <AssetRenderModeProvider mode="print">
              <RulebookPageRenderer page={snapshot.payload.page} settings={snapshot.payload.settings} pageNumber={1} />
            </AssetRenderModeProvider>
          </CaptureFrame>
        ),
      };
    case 'rulebook-pdf-batch':
      return {
        node: (
          <AssetRenderModeProvider mode="print">
            <RulebookDocumentRenderer
              document={snapshot.payload.document}
              pageOffset={snapshot.payload.pageOffset}
              label="Rulebook PDF batch"
            />
          </AssetRenderModeProvider>
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
  const [componentGeometry, setComponentGeometry] = useState<ComponentGeometry>();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(new Error('Timed out loading Publication job snapshot')),
      ASSET_SETTLE_TIMEOUT_MS
    );
    void (async () => {
      try {
        const response = await fetch(`${CAPTURE_PROTOCOL.paths.snapshot}${window.location.search}`, {
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
  const title = subject?.title;

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
    if (!title) {
      return;
    }
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

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
        await settleCardTitles(document, controller.signal);
        if (!disposed && !controller.signal.aborted) {
          if (isComponentAssetType(snapshot.assetType)) {
            const frame = document.querySelector<HTMLElement>(CAPTURE_PROTOCOL.frameMarker.selector);
            if (!frame) {
              throw new Error('Component capture frame is missing');
            }
            setComponentGeometry(measureComponentGeometry(frame));
          }
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
          [COMPONENT_GEOMETRY_PROTOCOL.attribute]: componentGeometry ? JSON.stringify(componentGeometry) : undefined,
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
