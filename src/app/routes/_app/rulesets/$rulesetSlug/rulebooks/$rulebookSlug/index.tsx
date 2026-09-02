import { Alert, Badge, Group, Select, Stack, Text, VisuallyHidden } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { formatRelativeDate, formatStableDate } from '@ui/content/dates';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, FileDown, FileText, Link2, Pin, PinOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { loadRulebookReader, useRulebookReader } from '@db/rulebooks';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { projectRulebookRenderDocument } from '@app/print/rulebook/projectRulebookRenderDocument';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RulebookDocumentRenderer } from '@game/rulebook/RulebookRenderer';

import {
  buildRulebookTextShareUrl,
  locatorFromRulebookSelection,
  parseRulebookTextLocator,
  publicAnchorFromUrl,
  resolvePublicAnchor,
  resolveRulebookTextLocator,
} from './-rulebookReaderLinks';
import styles from './index.module.css';

type RulebookReaderSearch = { edition?: number | undefined; loc?: string | undefined };

/**
 * Reads the reader's own two search parameters, and answers for both of them every time.
 * Both keys are always present, `undefined` included: a route's search is the parent match's search merged with this result, so omitting a rejected key does not drop it, it lets the raw value through to the loader and into the Convex query.
 * That is how `?edition=abc` reached `edition_number` and turned the public page into an error frame.
 */
function parseReaderSearch(input: Record<string, unknown>): RulebookReaderSearch {
  const rawEdition = typeof input.edition === 'string' ? Number(input.edition) : input.edition;
  const edition =
    typeof rawEdition === 'number' && Number.isSafeInteger(rawEdition) && rawEdition > 0 ? rawEdition : undefined;
  return { edition, loc: typeof input.loc === 'string' ? input.loc : undefined };
}

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/')({
  validateSearch: parseReaderSearch,
  loaderDeps: ({ search }) => ({ editionNumber: search.edition }),
  loader: ({ params, deps }) => loadRulebookReader({ ...params, editionNumber: deps.editionNumber }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.rulebook.name ?? 'Rulebook'} | Dune Zone` }],
  }),
  pendingComponent: () => (
    <PageMessage title="Rulebook">
      <LoadPending title="Loading Rulebook">Loading the selected Edition.</LoadPending>
    </PageMessage>
  ),
  errorComponent: RulebookReaderError,
  component: RulebookReaderPage,
});

function RulebookReaderError({ error }: ErrorComponentProps) {
  const { rulesetSlug } = Route.useParams();
  return (
    <PageMessage
      title="Rulebook"
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
    >
      <LoadError title="Rulebook could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

type ReaderData = NonNullable<ReturnType<typeof useRulebookReader>['data']>;

type ReaderViewState = {
  activePageId: string | undefined;
  locatorParam: string | undefined;
  pinned: boolean;
  selectionMessage: string | undefined;
  announcementId: number;
};

type ReaderViewEvent =
  | { kind: 'sync-locator'; locatorParam: string | undefined }
  | { kind: 'resolve-locator'; pageId: string | undefined; firstPageId: string | undefined }
  | { kind: 'change-edition'; pageId: string | undefined; firstPageId: string | undefined; pinned: boolean }
  | { kind: 'external-anchor'; pageId: string }
  | { kind: 'navigate-page'; pageId: string }
  | { kind: 'track-page'; pageId: string }
  | { kind: 'unpin' }
  | { kind: 'announce'; message: string }
  | { kind: 'clear-message' };

function syncReaderLocator(state: ReaderViewState, locatorParam: string | undefined): ReaderViewState {
  return state.locatorParam === locatorParam ? state : { ...state, locatorParam, selectionMessage: undefined };
}

function settleReaderPage(state: ReaderViewState, activePageId: string | undefined, pinned: boolean) {
  return state.activePageId === activePageId && state.pinned === pinned && state.selectionMessage === undefined
    ? state
    : { ...state, activePageId, pinned, selectionMessage: undefined };
}

function trackReaderPage(state: ReaderViewState, activePageId: string): ReaderViewState {
  return state.activePageId === activePageId && state.selectionMessage === undefined
    ? state
    : { ...state, activePageId, selectionMessage: undefined };
}

function unpinReaderTarget(state: ReaderViewState): ReaderViewState {
  return !state.pinned && state.locatorParam === undefined && state.selectionMessage === undefined
    ? state
    : { ...state, locatorParam: undefined, pinned: false, selectionMessage: undefined };
}

function clearReaderMessage(state: ReaderViewState): ReaderViewState {
  return state.selectionMessage === undefined ? state : { ...state, selectionMessage: undefined };
}

function readerViewReducer(state: ReaderViewState, event: ReaderViewEvent): ReaderViewState {
  switch (event.kind) {
    case 'sync-locator':
      return syncReaderLocator(state, event.locatorParam);
    case 'resolve-locator':
      return settleReaderPage(state, event.pageId ?? event.firstPageId, event.pageId !== undefined);
    case 'change-edition':
      return settleReaderPage(state, event.pageId ?? event.firstPageId, event.pinned);
    case 'external-anchor':
      return settleReaderPage(state, event.pageId, true);
    case 'navigate-page':
      return {
        ...state,
        activePageId: event.pageId,
        pinned: true,
        selectionMessage: undefined,
      };
    case 'track-page':
      return trackReaderPage(state, event.pageId);
    case 'unpin':
      return unpinReaderTarget(state);
    case 'announce':
      return { ...state, selectionMessage: event.message, announcementId: state.announcementId + 1 };
    case 'clear-message':
      return clearReaderMessage(state);
  }
}

function editionLabel(edition: ReaderData['editions'][number]) {
  return `Edition ${edition.edition_number}, ${formatStableDate(edition.created_at)}`;
}

function useReaderLocation() {
  const [location, setLocation] = useState<{ anchor?: string; externalNavigation: number }>({
    anchor: undefined,
    externalNavigation: 0,
  });
  useEffect(() => {
    const update = () =>
      setLocation((current) => ({
        anchor: publicAnchorFromUrl(window.location.href),
        externalNavigation: current.externalNavigation + 1,
      }));
    update();
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  const setAnchor = useCallback(
    (anchor: string | undefined) =>
      setLocation((current) => (current.anchor === anchor ? current : { ...current, anchor })),
    []
  );
  return { ...location, setAnchor };
}

function ReaderStatus({
  locatorStatus,
  targetMissing,
}: Readonly<{
  locatorStatus: ReturnType<typeof parseRulebookTextLocator>['status'] | 'stale';
  targetMissing: boolean;
}>) {
  if (locatorStatus === 'invalid') {
    return (
      <Alert color="red" title="Selected-text link rejected" role="alert">
        The link contains an invalid or oversized locator. Its decoded value was not rendered or used as a selector.
      </Alert>
    );
  }
  if (targetMissing) {
    return (
      <Alert color="yellow" title="Linked target unavailable" role="alert">
        The linked target does not exist in this Edition. The Rulebook starts at its first Page.
      </Alert>
    );
  }
  if (locatorStatus === 'stale') {
    return (
      <Alert color="yellow" title="Selected words changed" role="status">
        The words changed, but the stable Page or Block link still identifies the intended part of the Rulebook.
      </Alert>
    );
  }
  return null;
}

function artifactLabel(kind: 'html' | 'pdf', status: ReaderData['edition']['html']['status']) {
  return `${kind.toUpperCase()} ${status}`;
}

function RulebookReaderPage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const initialData = Route.useLoaderData();
  const { data } = useRulebookReader({
    ...params,
    editionNumber: search.edition,
    initialData,
  });
  if (!data) {
    return (
      <PageMessage
        title="Rulebook"
        back={
          <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }}>
            Back to ruleset
          </PageMessage.Back>
        }
      >
        <NotAvailable title="Rulebook not found">This Rulebook does not exist or was deleted.</NotAvailable>
      </PageMessage>
    );
  }
  return <RulebookReader data={data} />;
}

function RulebookReader({ data }: Readonly<{ data: ReaderData }>) {
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const renderDocument = useMemo(
    () => projectRulebookRenderDocument(data.edition.contents, data.assetsById),
    [data.assetsById, data.edition.contents]
  );
  const { anchor: hashAnchor, externalNavigation, setAnchor: setHashAnchor } = useReaderLocation();
  const [view, sendView] = useReducer(readerViewReducer, {
    activePageId: undefined,
    locatorParam: search.loc,
    pinned: false,
    selectionMessage: undefined,
    announcementId: 0,
  });
  const parsedLocator = useMemo(() => parseRulebookTextLocator(view.locatorParam), [view.locatorParam]);
  const locatorResolution = useMemo(
    () => resolveRulebookTextLocator(data.edition.contents, renderDocument, parsedLocator),
    [data.edition.contents, parsedLocator, renderDocument]
  );
  const anchorResolution = useMemo(
    () => resolvePublicAnchor(data.edition.contents, hashAnchor),
    [data.edition.contents, hashAnchor]
  );
  const locatorTarget =
    locatorResolution.status === 'matched' || locatorResolution.status === 'stale' ? locatorResolution : undefined;
  const locatedTarget = locatorTarget ?? anchorResolution;
  const locatedAnchorId = locatedTarget?.anchorId;
  const targetMissing =
    locatorResolution.status === 'unresolved' ||
    (parsedLocator.status === 'missing' && hashAnchor !== undefined && anchorResolution === undefined);
  const firstPageId = renderDocument.pageOrder[0];
  const readerRef = useRef<HTMLDivElement>(null);
  const meaningfulScroll = useRef(false);
  const handledExternalNavigation = useRef(externalNavigation);
  const renderedEdition = useRef(data.edition.edition_number);
  const recoveryTimer = useRef<number | undefined>(undefined);
  const cancelRecovery = useCallback(() => {
    if (recoveryTimer.current !== undefined) {
      window.clearTimeout(recoveryTimer.current);
      recoveryTimer.current = undefined;
    }
  }, []);

  useEffect(() => {
    sendView({ kind: 'sync-locator', locatorParam: search.loc });
  }, [search.loc]);

  useEffect(() => {
    if (view.locatorParam) {
      sendView({ kind: 'resolve-locator', pageId: locatorTarget?.pageId, firstPageId });
    }
  }, [firstPageId, locatorTarget?.pageId, view.locatorParam]);

  useEffect(() => {
    if (renderedEdition.current === data.edition.edition_number) {
      return;
    }
    renderedEdition.current = data.edition.edition_number;
    meaningfulScroll.current = false;
    sendView({
      kind: 'change-edition',
      pageId: view.locatorParam ? locatorTarget?.pageId : undefined,
      firstPageId,
      pinned: Boolean(view.locatorParam && locatorTarget),
    });
  }, [data.edition.edition_number, firstPageId, locatorTarget, view.locatorParam]);

  useEffect(() => {
    if (externalNavigation === handledExternalNavigation.current) {
      return;
    }
    handledExternalNavigation.current = externalNavigation;
    if (anchorResolution) {
      meaningfulScroll.current = false;
      sendView({ kind: 'external-anchor', pageId: anchorResolution.pageId });
    }
  }, [anchorResolution, externalNavigation]);

  useEffect(() => {
    const root = readerRef.current;
    if (!root) {
      return;
    }
    const pages = [...root.querySelectorAll<HTMLElement>('[data-rulebook-page-id]')];
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = pages.reduce<HTMLElement | undefined>((closest, page) => {
        if (!closest) {
          return page;
        }
        return Math.abs(page.getBoundingClientRect().top - 96) < Math.abs(closest.getBoundingClientRect().top - 96)
          ? page
          : closest;
      }, undefined);
      const pageId = next?.dataset.rulebookPageId;
      if (!pageId) {
        return;
      }
      sendView({ kind: 'track-page', pageId });
      if (!view.pinned && meaningfulScroll.current) {
        const page = data.edition.contents.pagesById[pageId];
        if (page) {
          const url = new URL(window.location.href);
          const anchorChanged = publicAnchorFromUrl(url.href) !== page.anchor;
          const locatorPresent = url.searchParams.has('loc');
          if (!anchorChanged && !locatorPresent) {
            return;
          }
          url.searchParams.delete('loc');
          url.hash = page.anchor;
          window.history.replaceState(window.history.state, '', url);
          setHashAnchor(page.anchor);
        }
      }
    };
    const onScroll = () => {
      meaningfulScroll.current = true;
      cancelRecovery();
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [cancelRecovery, data.edition.contents, setHashAnchor, view.pinned]);

  useEffect(() => {
    cancelRecovery();
    const targetAnchor = view.pinned ? locatedAnchorId : undefined;
    const target = targetAnchor ? document.getElementById(targetAnchor) : null;
    if (target) {
      target.setAttribute('data-rulebook-locator-target', 'true');
    }
    recoveryTimer.current = window.setTimeout(() => {
      recoveryTimer.current = undefined;
      if (meaningfulScroll.current) {
        return;
      }
      if (target) {
        const bounds = target.getBoundingClientRect();
        if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
          target.scrollIntoView({ block: 'center' });
        }
        return;
      }
      if (targetMissing && firstPageId) {
        readerRef.current?.querySelector<HTMLElement>(`[data-rulebook-page-id="${firstPageId}"]`)?.scrollIntoView({
          block: 'start',
        });
      }
    }, 700);
    return () => {
      cancelRecovery();
      target?.removeAttribute('data-rulebook-locator-target');
    };
  }, [cancelRecovery, firstPageId, locatedAnchorId, targetMissing, view.pinned]);

  const chooseEdition = (value: string | null) => {
    const edition = value ? Number(value) : data.rulebook.current_edition_number;
    sendView({ kind: 'clear-message' });
    void navigate({
      search: {
        ...(edition === data.rulebook.current_edition_number ? {} : { edition }),
        ...(view.locatorParam ? { loc: view.locatorParam } : {}),
      },
      resetScroll: false,
    });
  };
  const unpin = () => {
    sendView({ kind: 'unpin' });
    const active = view.activePageId ? data.edition.contents.pagesById[view.activePageId] : undefined;
    const url = new URL(window.location.href);
    url.searchParams.delete('loc');
    url.hash = active?.anchor ?? '';
    window.history.replaceState(window.history.state, '', url);
    setHashAnchor(active?.anchor);
  };
  const createSelectionLink = async () => {
    const result = locatorFromRulebookSelection(window.getSelection());
    if (!result.ok) {
      sendView({ kind: 'announce', message: result.message });
      return;
    }
    const resolution = resolveRulebookTextLocator(data.edition.contents, renderDocument, {
      status: 'valid',
      locator: result.locator,
    });
    if (resolution.status !== 'matched' && resolution.status !== 'stale') {
      sendView({ kind: 'announce', message: 'The selected text could not be tied to this Edition.' });
      return;
    }
    const url = buildRulebookTextShareUrl(window.location.href, result, resolution.anchorId);
    try {
      await navigator.clipboard.writeText(url);
      sendView({ kind: 'announce', message: 'Selected-text link copied.' });
    } catch {
      sendView({
        kind: 'announce',
        message: "The link could not be copied. Check this browser's clipboard permission.",
      });
    }
  };
  const locatorStatus = locatorResolution.status === 'stale' ? ('stale' as const) : parsedLocator.status;
  const historical = data.edition.edition_number !== data.rulebook.current_edition_number;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle
          title={data.rulebook.name}
          eyebrow={`Edition ${data.edition.edition_number}${historical ? ' · Historical' : ''}`}
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="sm" wrap="wrap">
              <IconAction
                label="Back to ruleset"
                variant="light"
                color="gray"
                icon={<ArrowLeft size={18} aria-hidden />}
                renderRoot={(props) => (
                  <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }} />
                )}
              />
              <Select
                aria-label="Rulebook Edition"
                value={String(data.edition.edition_number)}
                data={data.editions.map((edition) => ({
                  value: String(edition.edition_number),
                  label: editionLabel(edition),
                }))}
                allowDeselect={false}
                onChange={chooseEdition}
                w={220}
              />
              {data.edition.html.status === 'ready' && data.edition.html.href ? (
                <IconAction
                  label="Open Edition HTML"
                  tooltip="Open Edition HTML"
                  variant="subtle"
                  color="gray"
                  icon={<FileText size={17} aria-hidden />}
                  renderRoot={(props) => (
                    <a {...props} href={data.edition.html.href!} target="_blank" rel="noreferrer">
                      {props.children}
                    </a>
                  )}
                />
              ) : (
                <Badge color={data.edition.html.status === 'failed' ? 'red' : 'gray'} variant="light">
                  {artifactLabel('html', data.edition.html.status)}
                </Badge>
              )}
              {data.edition.pdf.status === 'ready' && data.edition.pdf.href ? (
                <IconAction
                  label="Open Edition PDF"
                  tooltip="Open Edition PDF"
                  variant="subtle"
                  color="gray"
                  icon={<FileDown size={17} aria-hidden />}
                  renderRoot={(props) => (
                    <a {...props} href={data.edition.pdf.href!} target="_blank" rel="noreferrer">
                      {props.children}
                    </a>
                  )}
                />
              ) : (
                <Badge color={data.edition.pdf.status === 'failed' ? 'red' : 'gray'} variant="light">
                  {artifactLabel('pdf', data.edition.pdf.status)}
                </Badge>
              )}
            </Group>
          </Toolbar.Left>
          <Toolbar.Right>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dimmed">
                Published{' '}
                <time dateTime={data.edition.created_at} title={new Date(data.edition.created_at).toLocaleString()}>
                  {formatRelativeDate(data.edition.created_at)}
                </time>
              </Text>
              <IconAction
                label="Copy link to selected text"
                tooltip="Copy link to selected text"
                variant="subtle"
                color="gray"
                icon={<Link2 size={17} aria-hidden />}
                onClick={() => void createSelectionLink()}
              />
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <div className={styles.readerContent}>
          <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
            {view.selectionMessage ? <span key={view.announcementId}>{view.selectionMessage}</span> : null}
          </VisuallyHidden>
          <Stack gap="sm" className={styles.statuses}>
            <ReaderStatus locatorStatus={locatorStatus} targetMissing={targetMissing} />
            {view.selectionMessage ? (
              <Text size="sm" aria-hidden="true">
                {view.selectionMessage}
              </Text>
            ) : null}
          </Stack>
          <div className={styles.readerGrid}>
            <Surface as="aside" padding="md" className={styles.contents}>
              <nav aria-label="Rulebook Pages">
                <Stack gap="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={700}>Pages</Text>
                    {view.pinned ? (
                      <IconAction
                        label="Unpin linked target"
                        tooltip="Let scrolling update the Page link"
                        variant="subtle"
                        color="gray"
                        icon={<PinOff size={16} aria-hidden />}
                        onClick={unpin}
                      />
                    ) : (
                      <Badge color="gray" variant="light" leftSection={<Pin size={12} aria-hidden />}>
                        Tracking
                      </Badge>
                    )}
                  </Group>
                  <ol className={styles.pageLinks}>
                    {renderDocument.pageOrder.flatMap((pageId, index) => {
                      const page = renderDocument.pagesById[pageId];
                      return page
                        ? [
                            <li key={page.id}>
                              <Link
                                from={Route.fullPath}
                                to="/rulesets/$rulesetSlug/rulebooks/$rulebookSlug"
                                params={params}
                                search={(previous) => previous}
                                hash={page.anchor}
                                resetScroll={false}
                                activeOptions={{ includeHash: true }}
                                aria-current={page.id === view.activePageId ? 'page' : undefined}
                                data-active={page.id === view.activePageId ? 'true' : undefined}
                                onClick={() => {
                                  meaningfulScroll.current = false;
                                  sendView({ kind: 'navigate-page', pageId: page.id });
                                  setHashAnchor(page.anchor);
                                }}
                              >
                                <span>{index + 1}</span>
                                {page.title}
                              </Link>
                            </li>,
                          ]
                        : [];
                    })}
                  </ol>
                </Stack>
              </nav>
            </Surface>
            <div ref={readerRef} className={styles.readerDocument} data-rulebook-reader-document>
              <RulebookDocumentRenderer
                document={renderDocument}
                as="section"
                label={`${data.rulebook.name} contents`}
              />
            </div>
          </div>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
