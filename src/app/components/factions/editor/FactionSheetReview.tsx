import { ActionIcon, Alert, Box, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { ChevronDown, Eye, Link2, X } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { Faction } from '@db/factions';
import { Shield } from '@game/assets/faction/shield/Shield';
import { shield as shieldSize } from '@game/data/sizes';
import { FactionRender } from '@game/schema/faction';

import { FactionSheetPagePreview, factionDraftForRenderer } from './FactionSheetPagePreview';
import styles from './FactionSheetReview.module.css';

const DESKTOP_REVIEW_MEDIA = '(min-width: 48em)';

function ScaledFactionShield({ faction }: { faction: Faction }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(352);
  const renderProps = FactionRender.shield.parse(factionDraftForRenderer(faction));
  const scale = frameWidth / shieldSize.width;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setFrameWidth(frame.clientWidth || 352);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className={styles.shieldFrame}
      style={{ height: shieldSize.height * scale }}
      role="img"
      aria-label="Faction shield preview"
    >
      <div className={styles.shieldCanvas} style={{ transform: `scale(${scale})` }}>
        <Shield {...renderProps} />
      </div>
    </div>
  );
}

function ReviewProofDesk({ faction }: { faction: Faction }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showScrollCue, setShowScrollCue] = useState(false);

  const updateScrollCue = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const hasOverflow = scroller.scrollHeight > scroller.clientHeight + 2;
    const pageOne = scroller.querySelector('[data-review-sheet-page="1"]');
    const pageTwo = scroller.querySelector('[data-review-sheet-page="2"]');
    const pagesShareRow =
      pageOne instanceof HTMLElement &&
      pageTwo instanceof HTMLElement &&
      Math.abs(pageOne.offsetTop - pageTwo.offsetTop) < 2;
    const reachedPageTwo =
      pageTwo instanceof HTMLElement && scroller.scrollTop >= pageTwo.offsetTop - 48;
    setShowScrollCue(hasOverflow && !pagesShareRow && !reachedPageTwo);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(updateScrollCue);
    if (typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(updateScrollCue);
    const scroller = scrollerRef.current;
    if (scroller) {
      observer.observe(scroller);
      if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [updateScrollCue]);

  return (
    <div className={styles.proofDesk} data-faction-review-proof-desk>
      <Group justify="space-between" gap="md" wrap="nowrap" className={styles.proofDeskHeader}>
        <div>
          <Text className={styles.proofDeskEyebrow}>Folio proof</Text>
          <Text fw={700}>Faction sheet and shield</Text>
        </div>
        <Text size="xs" ta="right">
          A4 portrait
          <br />
          210 × 297 mm
        </Text>
      </Group>

      <div className={styles.sheetCanvasShell}>
        <div
          ref={scrollerRef}
          className={styles.sheetScroller}
          data-faction-review-scroller
          onScroll={updateScrollCue}
        >
          <div className={styles.reviewArtifacts}>
            <ScaledFactionShield faction={faction} />
            <div className={styles.sheetSpread} data-faction-review-sheet-spread>
              <div className={styles.sheetPage} data-review-sheet-page="1">
                <FactionSheetPagePreview faction={faction} pageNumber={1} />
              </div>
              <div className={styles.sheetPage} data-review-sheet-page="2">
                <FactionSheetPagePreview faction={faction} pageNumber={2} />
              </div>
            </div>
          </div>
        </div>
        {showScrollCue ? (
          <div className={styles.scrollCue} role="status">
            <Text size="xs" fw={700}>
              Scroll for page 2
            </Text>
            <ChevronDown size={16} aria-hidden />
          </div>
        ) : null}
      </div>

      <Group justify="space-between" gap="md" className={styles.proofDeskFooter}>
        <Text size="xs">Current editor state</Text>
        <Text size="xs">Natural size · original proportions</Text>
      </Group>
    </div>
  );
}

function ReviewHeading({
  closeButtonRef,
  onClose,
}: {
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  return (
    <Stack gap="sm" className={styles.reviewHeading}>
      <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
        <Box>
          <Text className={styles.proofDeskEyebrow}>Current unsaved draft</Text>
          <Title order={2}>Review faction artifacts</Title>
          <Text size="sm" c="dimmed">
            Editing is paused while the review plane is open.
          </Text>
        </Box>
        <Group gap="xs" wrap="nowrap">
          <Button type="button" variant="default" leftSection={<X size={16} />} onClick={onClose}>
            Return to editing
          </Button>
          <ActionIcon
            ref={closeButtonRef}
            type="button"
            variant="default"
            size="lg"
            aria-label="Close faction sheet review"
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </ActionIcon>
        </Group>
      </Group>
      <Alert
        variant="light"
        color="orange"
        icon={<Link2 size={18} aria-hidden />}
        title="Share the faction URL, not a screenshot"
      >
        Save this draft first, then share its canonical faction URL so everyone reaches the
        published version.
      </Alert>
    </Stack>
  );
}

export function FactionSheetReview({
  faction,
  children,
}: {
  faction: Faction;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const reviewTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mountFrameRef = useRef<number | null>(null);
  const [editorPlaneWidth, setEditorPlaneWidth] = useState(0);
  const [reviewMounted, setReviewMounted] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const closeReview = useCallback(() => {
    setReviewOpen(false);
    reviewTriggerRef.current?.focus({ preventScroll: true });
  }, []);

  const openReview = () => {
    if (!window.matchMedia(DESKTOP_REVIEW_MEDIA).matches) return;
    setEditorPlaneWidth(stageRef.current?.clientWidth ?? 0);
    if (reviewMounted) {
      setReviewOpen(true);
      return;
    }
    setReviewMounted(true);
    mountFrameRef.current = requestAnimationFrame(() => {
      mountFrameRef.current = requestAnimationFrame(() => setReviewOpen(true));
    });
  };

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_REVIEW_MEDIA);
    const onMediaChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setReviewOpen(false);
    };
    media.addEventListener('change', onMediaChange);
    return () => media.removeEventListener('change', onMediaChange);
  }, []);

  useEffect(() => {
    if (!reviewOpen) return;
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeReview, reviewOpen]);

  useEffect(
    () => () => {
      if (mountFrameRef.current != null) cancelAnimationFrame(mountFrameRef.current);
    },
    []
  );

  const stageStyle = {
    '--editor-plane-width': `${editorPlaneWidth}px`,
  } as CSSProperties;

  return (
    <section
      ref={stageRef}
      className={styles.stage}
      style={stageStyle}
      data-faction-sheet-review
      data-review-open={reviewOpen || undefined}
    >
      <div className={styles.editorPlane} data-faction-review-editor-plane>
        <div
          className={styles.editorContent}
          aria-hidden={reviewOpen || undefined}
          inert={reviewOpen ? true : undefined}
        >
          <Stack gap="xl">
            {children}
            <Paper
              withBorder
              radius="lg"
              p={{ base: 'md', sm: 'xl' }}
              className={styles.reviewAction}
              visibleFrom="sm"
            >
              <Group justify="space-between" align="center" gap="lg" wrap="wrap">
                <Box>
                  <Title order={3}>Ready to review the complete faction?</Title>
                  <Text size="sm" c="dimmed">
                    Inspect the real two-page sheet and shield without leaving this draft.
                  </Text>
                </Box>
                <Button
                  ref={reviewTriggerRef}
                  type="button"
                  color="dune"
                  leftSection={<Eye size={17} aria-hidden />}
                  onClick={openReview}
                >
                  Review faction sheet
                </Button>
              </Group>
            </Paper>
          </Stack>
        </div>
        {reviewOpen ? (
          <button
            type="button"
            className={styles.editorCloseTarget}
            aria-label="Close sheet review and return to editing"
            onClick={closeReview}
          />
        ) : null}
      </div>

      {reviewMounted ? (
        <aside
          className={styles.reviewPanel}
          data-faction-review-panel
          aria-hidden={!reviewOpen}
          inert={reviewOpen ? undefined : true}
        >
          <div className={styles.reviewViewport} data-faction-review-viewport>
            <ReviewHeading closeButtonRef={closeButtonRef} onClose={closeReview} />
            <ReviewProofDesk faction={faction} />
          </div>
        </aside>
      ) : null}
    </section>
  );
}
