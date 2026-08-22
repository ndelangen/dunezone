import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Group,
  List,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowLeft, ArrowRight, Clipboard, ExternalLink, Link2, Pin, PinOff, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildRulebookTextShareUrl,
  locatorFromBrowserSelection,
  parseRulebookTextLocator,
  resolveRulebookTextLocator,
  RULEBOOK_PROTOTYPE_PAGES,
} from './-rulebookTextLinksPrototype';
import type {
  LocatorParseResult,
  LocatorResolution,
  RulebookPrototypePage,
  RulebookPrototypeVariant,
} from './-rulebookTextLinksPrototype';
import styles from './RulebookTextLinksPrototype.module.css';

type PrototypeSearch = {
  variant: RulebookPrototypeVariant;
  loc?: string;
  simulate?: 'unsupported';
};

const VARIANTS: Array<{ value: RulebookPrototypeVariant; label: string; shortLabel: string }> = [
  { value: 'reader', label: 'Continuous reader', shortLabel: 'Reader' },
  { value: 'editor', label: 'Located editor Page', shortLabel: 'Editor' },
  { value: 'compatibility', label: 'Compatibility fallback', shortLabel: 'Fallback' },
];

export const Route = createFileRoute('/_app/__rulebook-text-links-prototype')({
  codeSplitGroupings: [['component']],
  validateSearch: (input: Record<string, unknown>): PrototypeSearch => ({
    variant: VARIANTS.some((variant) => variant.value === input.variant)
      ? (input.variant as RulebookPrototypeVariant)
      : 'reader',
    ...(typeof input.loc === 'string' ? { loc: input.loc } : {}),
    ...(input.simulate === 'unsupported' ? { simulate: 'unsupported' as const } : {}),
  }),
  component: RulebookTextLinksPrototype,
});

function useVisualPage(pinned: boolean) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(pinned);

  useEffect(() => {
    if (pinned) {
      setVisible(true);
      return;
    }
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pinned]);

  return { nodeRef, visualState: pinned ? 'pinned' : visible ? 'ready' : 'waiting' } as const;
}

function RulebookPageView({
  page,
  pinned,
  targetAnchorId,
}: {
  page: RulebookPrototypePage;
  pinned: boolean;
  targetAnchorId?: string;
}) {
  const { nodeRef, visualState } = useVisualPage(pinned);
  return (
    <article
      ref={nodeRef}
      id={page.id}
      className={styles.rulePage}
      data-rulebook-page-anchor
      data-visual-state={visualState}
      aria-labelledby={`${page.id}-title`}
    >
      <Text className={styles.pageNumber} aria-hidden>
        {page.number.toString().padStart(2, '0')}
      </Text>
      <Stack gap="xl">
        <div>
          <Badge color="dune" variant="light">
            Page {page.number}
          </Badge>
          <Title id={`${page.id}-title`} order={2} mt="xs">
            {page.title}
          </Title>
        </div>
        {page.blocks.map((block) => (
          <section
            id={block.id}
            className={styles.block}
            key={block.id}
            data-rulebook-block-anchor
            data-locator-target={targetAnchorId === block.id ? 'true' : undefined}
            data-testid={block.testId}
            aria-labelledby={`${block.id}-title`}
          >
            <Title id={`${block.id}-title`} order={3} mb="xs">
              {block.title}
            </Title>
            <Stack gap="sm">
              {block.paragraphs.map((paragraph) => (
                <Text key={paragraph}>{paragraph}</Text>
              ))}
            </Stack>
          </section>
        ))}
      </Stack>
    </article>
  );
}

function LocatorStatus({ parsed, resolution }: { parsed: LocatorParseResult; resolution: LocatorResolution }) {
  if (parsed.status === 'invalid') {
    return (
      <Alert color="red" title="Locator rejected" role="alert">
        {parsed.message} No decoded value was rendered or used as a selector.
      </Alert>
    );
  }
  if (resolution.status === 'unresolved') {
    return (
      <Alert color="orange" title="Target unavailable" role="alert">
        The validated path does not exist in this Rulebook fixture. The page remains usable.
      </Alert>
    );
  }
  if (resolution.status === 'stale') {
    return (
      <Alert color="orange" title="Selected words changed" role="status">
        The stable anchor still resolves, so the application highlighted and scrolled to the containing Block or Page.
      </Alert>
    );
  }
  if (resolution.status === 'matched') {
    return (
      <Alert color="green" title="Locator matched" role="status">
        The stable anchor and selected text agree with this fixture.
      </Alert>
    );
  }
  return (
    <Alert color="blue" title="Try a real selection" role="status">
      Select text inside a Rulebook Page, then create a link. Open it in a fresh tab to test browser-native matching.
    </Alert>
  );
}

function RulebookTextLinksPrototype() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const parsed = useMemo(() => parseRulebookTextLocator(search.loc), [search.loc]);
  const resolution = useMemo(() => resolveRulebookTextLocator(parsed), [parsed]);
  const targetPage = resolution.status === 'matched' || resolution.status === 'stale' ? resolution.page : undefined;
  const targetAnchorId =
    resolution.status === 'matched' || resolution.status === 'stale' ? resolution.anchorId : undefined;
  const locatorKey = search.loc ?? '';
  const [unpinnedLocator, setUnpinnedLocator] = useState<string | null>(null);
  const pinned = Boolean(targetPage) && unpinnedLocator !== locatorKey;
  const [selectedEditorPageId, setSelectedEditorPageId] = useState(targetPage?.id ?? RULEBOOK_PROTOTYPE_PAGES[0]!.id);
  const [shareUrl, setShareUrl] = useState<string>();
  const [selectionMessage, setSelectionMessage] = useState<string>();
  const [nativeSupport, setNativeSupport] = useState<'checking' | 'detected' | 'not-detected'>('checking');
  const forceFallback = search.variant === 'compatibility' || search.simulate === 'unsupported';

  useEffect(() => {
    setNativeSupport('fragmentDirective' in document ? 'detected' : 'not-detected');
  }, []);

  useEffect(() => {
    if (targetPage) {
      setSelectedEditorPageId(targetPage.id);
    }
  }, [locatorKey, targetPage]);

  useEffect(() => {
    if (!targetAnchorId || resolution.status === 'missing' || resolution.status === 'invalid') {
      return;
    }
    const shouldApplyFallback = forceFallback || nativeSupport === 'not-detected' || resolution.status === 'stale';
    if (!shouldApplyFallback) {
      return;
    }
    const target = document.getElementById(targetAnchorId);
    if (!target) {
      return;
    }
    const frame = requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [forceFallback, nativeSupport, resolution.status, targetAnchorId]);

  const setVariant = useCallback(
    (variant: RulebookPrototypeVariant) => {
      void navigate({
        to: '/__rulebook-text-links-prototype',
        search: { ...search, variant, ...(variant === 'compatibility' ? { simulate: 'unsupported' as const } : {}) },
        replace: true,
      });
    },
    [navigate, search]
  );

  const createSelectionLink = () => {
    const result = locatorFromBrowserSelection(window.getSelection());
    if (!result.ok) {
      setSelectionMessage(result.message);
      setShareUrl(undefined);
      return;
    }
    const base = `${window.location.origin}${window.location.pathname}`;
    setShareUrl(buildRulebookTextShareUrl(base, result.locator, search.variant));
    setSelectionMessage('Share URL created from the browser Selection. Open it fresh to test the full path.');
  };

  const editorPage =
    RULEBOOK_PROTOTYPE_PAGES.find((page) => page.id === selectedEditorPageId) ?? RULEBOOK_PROTOTYPE_PAGES[0]!;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack className={styles.hero} gap="xs">
          <Badge color="orange" variant="filled" w="fit-content">
            Prototype, not production
          </Badge>
          <Title order={1}>Can selected Rulebook text survive a fresh link?</Title>
          <Text size="lg">
            Three views compare native Text Fragments with a bounded application locator and a stable anchor fallback.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Surface as="section" padding="md" className={styles.toolbar} aria-label="Prototype mode">
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text fw={700}>Current view</Text>
              <Text size="sm" c="dimmed">
                Switch views without changing the locator.
              </Text>
            </div>
            <SegmentedControl
              aria-label="Prototype view"
              value={search.variant}
              data={VARIANTS.map(({ value, shortLabel }) => ({ value, label: shortLabel }))}
              onChange={(value) => setVariant(value as RulebookPrototypeVariant)}
            />
          </Group>
        </Surface>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <div className={styles.prototype}>
          <div className={styles.contentGrid}>
            <Stack className={styles.sideRail} gap="md">
              <Surface as="section" padding="lg" aria-labelledby="selection-link-heading">
                <Stack gap="md">
                  <div>
                    <Title id="selection-link-heading" order={2} size="h3">
                      Create a selection link
                    </Title>
                    <Text size="sm" c="dimmed">
                      Select visible Rulebook text with the browser, then use this action.
                    </Text>
                  </div>
                  <Button leftSection={<Link2 size={16} aria-hidden />} onClick={createSelectionLink}>
                    Create link from selection
                  </Button>
                  {selectionMessage && (
                    <Text role="status" size="sm">
                      {selectionMessage}
                    </Text>
                  )}
                  {shareUrl && (
                    <Stack gap="xs">
                      <Code className={styles.shareUrl} block data-testid="share-url">
                        {shareUrl}
                      </Code>
                      <Group grow>
                        <Button
                          variant="light"
                          leftSection={<Clipboard size={16} aria-hidden />}
                          onClick={() => void navigator.clipboard.writeText(shareUrl)}
                        >
                          Copy
                        </Button>
                        <Button
                          component="a"
                          href={shareUrl}
                          target="_blank"
                          rel="noopener"
                          variant="light"
                          leftSection={<ExternalLink size={16} aria-hidden />}
                        >
                          Open fresh
                        </Button>
                      </Group>
                    </Stack>
                  )}
                </Stack>
              </Surface>

              <Surface as="section" padding="lg" aria-labelledby="locator-state-heading">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Title id="locator-state-heading" order={2} size="h3">
                      Fresh-load state
                    </Title>
                    {pinned && <Badge leftSection={<Pin size={12} aria-hidden />}>Pinned</Badge>}
                  </Group>
                  <LocatorStatus parsed={parsed} resolution={resolution} />
                  {pinned && (
                    <Button
                      variant="subtle"
                      leftSection={<PinOff size={16} aria-hidden />}
                      onClick={() => setUnpinnedLocator(locatorKey)}
                    >
                      Unpin target
                    </Button>
                  )}
                  <Text size="sm">
                    Native API: <strong>{nativeSupport}</strong>
                  </Text>
                  <Text size="sm">
                    Active scroll owner:{' '}
                    <strong>{forceFallback ? 'application fallback' : 'browser when matched'}</strong>
                  </Text>
                </Stack>
              </Surface>

              <Surface as="section" padding="lg" aria-labelledby="ownership-heading">
                <Stack gap="sm">
                  <Title id="ownership-heading" order={2} size="h3">
                    Ownership boundary
                  </Title>
                  <List size="sm" spacing="xs" icon={<ShieldCheck size={15} aria-hidden />}>
                    <List.Item>Browser: match, scroll, and highlight the native text directive.</List.Item>
                    <List.Item>Application: validate the bounded locator and resolve its Contents path.</List.Item>
                    <List.Item>Application: pin and highlight the stable Block or Page fallback.</List.Item>
                    <List.Item>Never: decoded HTML, URL-derived selectors, or evaluated script.</List.Item>
                  </List>
                  <Anchor href="https://wicg.github.io/scroll-to-text-fragment/" target="_blank" rel="noopener">
                    Text Fragment specification
                  </Anchor>
                </Stack>
              </Surface>

              {search.variant === 'editor' && (
                <Surface as="section" padding="lg" aria-labelledby="editor-pages-heading">
                  <Stack gap="sm">
                    <Title id="editor-pages-heading" order={2} size="h3">
                      Editor Page
                    </Title>
                    <div className={styles.editorPagePicker}>
                      {RULEBOOK_PROTOTYPE_PAGES.map((page) => (
                        <Button
                          key={page.id}
                          variant={page.id === editorPage.id ? 'filled' : 'light'}
                          onClick={() => setSelectedEditorPageId(page.id)}
                        >
                          {page.number}
                        </Button>
                      ))}
                    </div>
                  </Stack>
                </Surface>
              )}
            </Stack>

            <main className={styles.document} data-rulebook-prototype-document aria-label="Prototype Rulebook">
              {search.variant === 'editor' ? (
                <RulebookPageView
                  page={editorPage}
                  pinned={pinned && editorPage.id === targetPage?.id}
                  targetAnchorId={editorPage.id === targetPage?.id ? targetAnchorId : undefined}
                />
              ) : (
                RULEBOOK_PROTOTYPE_PAGES.map((page) => (
                  <RulebookPageView
                    key={page.id}
                    page={page}
                    pinned={pinned && page.id === targetPage?.id}
                    targetAnchorId={page.id === targetPage?.id ? targetAnchorId : undefined}
                  />
                ))
              )}
            </main>
          </div>

          <PrototypeSwitcher variant={search.variant} onChange={setVariant} />
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

function PrototypeSwitcher({
  variant,
  onChange,
}: {
  variant: RulebookPrototypeVariant;
  onChange: (variant: RulebookPrototypeVariant) => void;
}) {
  const currentIndex = VARIANTS.findIndex((candidate) => candidate.value === variant);
  const cycle = useCallback(
    (direction: -1 | 1) => {
      const next = (currentIndex + direction + VARIANTS.length) % VARIANTS.length;
      onChange(VARIANTS[next]!.value);
    },
    [currentIndex, onChange]
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cycle]);

  if (import.meta.env.PROD) {
    return null;
  }
  return (
    <Paper className={styles.switcher} role="group" aria-label="Prototype variants">
      <Button variant="subtle" color="gray" aria-label="Previous prototype view" onClick={() => cycle(-1)}>
        <ArrowLeft size={18} aria-hidden />
      </Button>
      <Text className={styles.switcherLabel} fw={700} truncate>
        {currentIndex + 1} of {VARIANTS.length} — {VARIANTS[currentIndex]!.label}
      </Text>
      <Button variant="subtle" color="gray" aria-label="Next prototype view" onClick={() => cycle(1)}>
        <ArrowRight size={18} aria-hidden />
      </Button>
    </Paper>
  );
}
