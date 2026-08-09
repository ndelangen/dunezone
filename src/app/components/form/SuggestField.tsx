import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

import styles from './SuggestField.module.css';
import type { TextFieldAppearance } from './TextField';
import { TextField } from './TextField';

interface SuggestFieldOptionAdapters {
  toLabel?: (raw: string) => string;
  toSearchText?: (raw: string) => string;
  toPreviewSrc?: (raw: string) => string | null | undefined;
  render?: (raw: string) => ReactNode;
}

export interface SuggestFieldProps {
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  optionAdapters?: SuggestFieldOptionAdapters;
  id?: string;
  placeholder?: string;
  appearance?: TextFieldAppearance;
}

type ListGeom = { top: number; left: number; width: number };
type PreviewGeom = { left: number; top: number };
const identityOptionLabel = (raw: string) => raw;
const identityOptionSearchText = (raw: string) => raw;

const PREVIEW_SIZE = 100;
const PREVIEW_GAP = 8;
const VIEWPORT_PAD = 6;

type Partition = {
  included: string[];
  excluded: string[];
  flat: string[];
};

function scoreCandidate(option: string, qLower: string): number | null {
  if (qLower.length === 0) {
    return 0;
  }
  const o = option.toLowerCase();
  if (!o.includes(qLower)) {
    return null;
  }
  if (o === qLower) {
    return 4_000_000;
  }
  if (o.startsWith(qLower)) {
    return 3_000_000 + Math.max(0, 10_000 - o.length);
  }
  const idx = o.indexOf(qLower);
  return 2_000_000 + Math.max(0, 10_000 - idx);
}

function relevanceScore(
  option: string,
  optionLabel: string,
  optionSearchText: string,
  qLower: string
): number | null {
  const rawScore = scoreCandidate(option, qLower);
  const labelScore = scoreCandidate(optionLabel, qLower);
  const searchScore = scoreCandidate(optionSearchText, qLower);
  if (rawScore == null && labelScore == null && searchScore == null) {
    return null;
  }
  return Math.max(
    rawScore ?? Number.NEGATIVE_INFINITY,
    labelScore ?? Number.NEGATIVE_INFINITY,
    searchScore ?? Number.NEGATIVE_INFINITY
  );
}

function partitionOptions(
  options: readonly string[],
  rawQuery: string,
  optionToLabel: (raw: string) => string,
  optionToSearchText: (raw: string) => string
): Partition {
  const q = rawQuery.trim().toLowerCase();
  const unique = [...new Set(options)].sort((a, b) => a.localeCompare(b));

  if (q.length === 0) {
    return { included: unique, excluded: [], flat: unique };
  }

  const rows = unique.map((opt) => ({
    opt,
    score: relevanceScore(opt, optionToLabel(opt), optionToSearchText(opt), q),
  }));

  const included = rows
    .filter((r): r is { opt: string; score: number } => r.score != null)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.opt.localeCompare(b.opt);
    })
    .map((r) => r.opt);

  const excluded = rows
    .filter((r) => r.score == null)
    .map((r) => r.opt)
    .sort((a, b) => a.localeCompare(b));

  return { included, excluded, flat: [...included, ...excluded] };
}

/**
 * The typed text may match an option's raw value or its label, exactly or case-insensitively; only
 * an unambiguous match commits.
 */
function resolveTypedOption(
  typed: string,
  options: readonly string[],
  optionToLabel: (raw: string) => string
): string | null {
  const t = typed.trim();
  const exact = options.find((o) => o === t);
  if (exact) {
    return exact;
  }
  const lower = t.toLowerCase();
  const oneRaw = options.filter((o) => o.toLowerCase() === lower);
  if (oneRaw.length === 1) {
    return oneRaw[0];
  }
  const exactLabel = options.filter((o) => optionToLabel(o) === t);
  if (exactLabel.length === 1) {
    return exactLabel[0];
  }
  const lowerLabel = options.filter((o) => optionToLabel(o).toLowerCase() === lower);
  if (lowerLabel.length === 1) {
    return lowerLabel[0];
  }
  return null;
}

function computePreviewGeom(inputRect: DOMRect, optionRect: DOMRect | undefined): PreviewGeom {
  let left = inputRect.left - PREVIEW_SIZE - PREVIEW_GAP;
  if (left < VIEWPORT_PAD) {
    left = inputRect.right + PREVIEW_GAP;
  }

  const anchorTop = optionRect
    ? optionRect.top + optionRect.height / 2
    : inputRect.top + inputRect.height / 2;
  const top = Math.min(
    Math.max(VIEWPORT_PAD, anchorTop - PREVIEW_SIZE / 2),
    window.innerHeight - PREVIEW_SIZE - VIEWPORT_PAD
  );
  return { left, top };
}

function useComboboxListPosition(
  open: boolean,
  optionCount: number,
  inputRef: RefObject<HTMLInputElement | null>
): ListGeom | null {
  const [listGeom, setListGeom] = useState<ListGeom | null>(null);

  const updateListPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const gap = 4;
    setListGeom({ top: Math.ceil(r.bottom) + gap, left: r.left, width: r.width });
  }, [inputRef]);

  useLayoutEffect(() => {
    if (!open || optionCount === 0) {
      setListGeom(null);
      return;
    }
    updateListPosition();
    const el = inputRef.current;
    const ro =
      typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(updateListPosition) : null;
    ro?.observe(el as Element);
    window.addEventListener('resize', updateListPosition);
    window.addEventListener('scroll', updateListPosition, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateListPosition);
      window.removeEventListener('scroll', updateListPosition, true);
    };
  }, [open, optionCount, updateListPosition, inputRef]);

  return listGeom;
}

/**
 * Tracks where the hovered/highlighted option's image preview should float. Reads
 * highlight/flat/open state via refs so the effect can resync from rAF and observer callbacks
 * without re-subscribing on every keystroke.
 */
function usePreviewPosition({
  open,
  showList,
  highlight,
  flatOptions,
  optionToPreviewSrc,
  listId,
  listGeom,
  inputRef,
  portalRef,
}: {
  open: boolean;
  showList: boolean;
  highlight: number;
  flatOptions: readonly string[];
  optionToPreviewSrc?: (raw: string) => string | null | undefined;
  listId: string;
  listGeom: ListGeom | null;
  inputRef: RefObject<HTMLInputElement | null>;
  portalRef: RefObject<HTMLDivElement | null>;
}): PreviewGeom | null {
  const [previewGeom, setPreviewGeom] = useState<PreviewGeom | null>(null);
  const openRef = useRef(open);
  const showListRef = useRef(showList);
  const highlightRef = useRef(highlight);
  const flatRef = useRef(flatOptions);

  /**
   * Sync refs in a layout effect (not during render) so a discarded/replayed render can't leave the
   * rAF and observer callbacks below reading stale state.
   */
  useLayoutEffect(() => {
    openRef.current = open;
    showListRef.current = showList;
    highlightRef.current = highlight;
    flatRef.current = flatOptions;
  }, [open, showList, highlight, flatOptions]);

  // oxlint-disable-next-line react/exhaustive-deps -- listGeom is a resync trigger, not read directly below.
  useLayoutEffect(() => {
    if (!open || !showList || !optionToPreviewSrc) {
      setPreviewGeom(null);
      return;
    }

    const sync = () => {
      if (!openRef.current || !showListRef.current) {
        setPreviewGeom(null);
        return;
      }
      const h = highlightRef.current;
      const option = flatRef.current[h];
      const previewSrc = option ? optionToPreviewSrc(option) : null;
      if (!previewSrc) {
        setPreviewGeom(null);
        return;
      }
      const inputEl = inputRef.current;
      if (!inputEl) {
        setPreviewGeom(null);
        return;
      }
      const optId = `${listId}-opt-${h}`;
      const optEl = portalRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optId)}`) ?? null;
      setPreviewGeom(
        computePreviewGeom(inputEl.getBoundingClientRect(), optEl?.getBoundingClientRect())
      );
    };

    sync();

    let raf0 = 0;
    let raf1 = 0;
    raf0 = requestAnimationFrame(() => {
      raf1 = requestAnimationFrame(() => {
        sync();
      });
    });

    const portal = portalRef.current;
    const inputEl = inputRef.current;
    const roPortal =
      typeof ResizeObserver !== 'undefined' && portal ? new ResizeObserver(sync) : null;
    roPortal?.observe(portal as Element);
    const roInput =
      typeof ResizeObserver !== 'undefined' && inputEl ? new ResizeObserver(sync) : null;
    roInput?.observe(inputEl as Element);
    portal?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);

    return () => {
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(raf1);
      roPortal?.disconnect();
      roInput?.disconnect();
      portal?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      setPreviewGeom(null);
    };
  }, [
    open,
    showList,
    highlight,
    listId,
    optionToPreviewSrc,
    flatOptions,
    listGeom,
    inputRef,
    portalRef,
  ]);

  return previewGeom;
}

function ComboboxOptionButton({
  optionId,
  isActive,
  label,
  onHover,
  onSelect,
}: {
  optionId: string;
  isActive: boolean;
  label: ReactNode;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      id={optionId}
      type="button"
      className={isActive ? styles.comboboxOptionActive : styles.comboboxOption}
      onMouseEnter={onHover}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

function ComboboxOptionList({
  listId,
  listGeom,
  partition,
  highlight,
  noMatchesOnly,
  includedLabel,
  excludedLabel,
  optionToLabel,
  renderOption,
  portalRef,
  onHighlight,
  onCommit,
}: {
  listId: string;
  listGeom: ListGeom;
  partition: Partition;
  highlight: number;
  noMatchesOnly: boolean;
  includedLabel: string;
  excludedLabel: string;
  optionToLabel: (raw: string) => string;
  renderOption?: (raw: string) => ReactNode;
  portalRef: RefObject<HTMLDivElement | null>;
  onHighlight: (index: number) => void;
  onCommit: (option: string) => void;
}) {
  const buttonFor = (opt: string, index: number) => (
    <ComboboxOptionButton
      key={opt}
      optionId={`${listId}-opt-${index}`}
      isActive={index === highlight}
      label={renderOption ? renderOption(opt) : optionToLabel(opt)}
      onHover={() => onHighlight(index)}
      onSelect={() => onCommit(opt)}
    />
  );

  return createPortal(
    <div
      ref={portalRef}
      id={listId}
      className={styles.comboboxListPortal}
      style={{ top: listGeom.top, left: listGeom.left, width: listGeom.width }}
    >
      {noMatchesOnly ? (
        <div className={styles.comboboxSection}>
          <div className={styles.comboboxSectionLabel}>No substring match — all options</div>
          {partition.excluded.map((opt, i) => buttonFor(opt, i))}
        </div>
      ) : (
        <>
          <div className={styles.comboboxSection}>
            <div className={styles.comboboxSectionLabel}>{includedLabel}</div>
            {partition.included.map((opt, i) => buttonFor(opt, i))}
          </div>
          {partition.excluded.length > 0 && (
            <div className={styles.comboboxSection}>
              <div className={styles.comboboxSectionDivider} />
              <div className={styles.comboboxSectionLabel}>{excludedLabel}</div>
              {partition.excluded.map((opt, j) => buttonFor(opt, partition.included.length + j))}
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  );
}

export function SuggestField({
  value,
  onChange,
  options,
  optionAdapters,
  id: idProp,
  placeholder = 'Type to search…',
  appearance,
}: SuggestFieldProps) {
  const optionToLabel = optionAdapters?.toLabel ?? identityOptionLabel;
  const optionToSearchText = optionAdapters?.toSearchText ?? identityOptionSearchText;
  const optionToPreviewSrc = optionAdapters?.toPreviewSrc;
  const renderOption = optionAdapters?.render;

  const reactId = useId();
  const id = idProp ?? `suggest-${reactId}`;
  const listId = `${id}-listbox`;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(optionToLabel(value));
  const [highlight, setHighlight] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(optionToLabel(value));
  }, [value, optionToLabel]);

  const partition = useMemo(
    () => partitionOptions(options, text, optionToLabel, optionToSearchText),
    [options, optionToLabel, optionToSearchText, text]
  );

  useEffect(() => {
    if (highlight >= partition.flat.length) {
      setHighlight(Math.max(0, partition.flat.length - 1));
    }
  }, [partition.flat.length, highlight]);

  const listGeom = useComboboxListPosition(open, options.length, inputRef);
  const showList = open && options.length > 0 && listGeom != null;

  useLayoutEffect(() => {
    if (showList) {
      setHighlight(0);
    }
  }, [showList]);

  useLayoutEffect(() => {
    if (!showList) {
      return;
    }
    const p = portalRef.current;
    if (!p) {
      return;
    }
    const preventBlur = (e: Event) => e.preventDefault();
    p.addEventListener('mousedown', preventBlur);
    return () => p.removeEventListener('mousedown', preventBlur);
  }, [showList]);

  const previewGeom = usePreviewPosition({
    open,
    showList,
    highlight,
    flatOptions: partition.flat,
    optionToPreviewSrc,
    listId,
    listGeom,
    inputRef,
    portalRef,
  });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) {
        return;
      }
      if (portalRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setText(optionToLabel(next));
      setOpen(false);
    },
    [onChange, optionToLabel]
  );

  const tryCommitText = useCallback(() => {
    const resolved = resolveTypedOption(text, options, optionToLabel);
    if (resolved) {
      commit(resolved);
    } else {
      setText(optionToLabel(value));
    }
  }, [commit, optionToLabel, options, text, value]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setText(optionToLabel(value));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, partition.flat.length - 1)));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    }
    if (e.key === 'Enter' && open && partition.flat[highlight]) {
      e.preventDefault();
      commit(partition.flat[highlight]);
    }
  };

  const hasFilter = text.trim().length > 0;
  const noMatchesOnly =
    hasFilter && partition.included.length === 0 && partition.excluded.length > 0;

  const selectedOption = showList ? partition.flat[highlight] : undefined;
  const previewActiveSrc =
    optionToPreviewSrc && selectedOption ? optionToPreviewSrc(selectedOption) : null;

  return (
    <>
      <div
        ref={wrapRef}
        data-suggestfield-open={open ? 'true' : undefined}
        className={clsx(
          styles.comboboxWrap,
          open && styles.comboboxWrapOpen,
          appearance === 'embedded' && styles.comboboxWrapEmbedded
        )}
      >
        <TextField
          ref={inputRef}
          id={id}
          appearance={appearance}
          className={styles.comboboxInput}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            showList && partition.flat[highlight] ? `${listId}-opt-${highlight}` : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={(e) => {
            e.currentTarget.select();
            setOpen(true);
          }}
          onBlur={() => {
            tryCommitText();
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          id={`${id}-caret`}
          className={clsx(styles.comboboxCaret, open && styles.comboboxCaretOpen)}
          tabIndex={-1}
          disabled={options.length === 0}
          aria-label="Toggle suggestions"
          aria-expanded={open}
          aria-controls={listId}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            if (options.length === 0) {
              return;
            }
            setOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {typeof document !== 'undefined' && showList && listGeom && (
        <ComboboxOptionList
          listId={listId}
          listGeom={listGeom}
          partition={partition}
          highlight={highlight}
          noMatchesOnly={noMatchesOnly}
          includedLabel={hasFilter ? 'Likely matches' : 'All options'}
          excludedLabel="Other options"
          optionToLabel={optionToLabel}
          renderOption={renderOption}
          portalRef={portalRef}
          onHighlight={setHighlight}
          onCommit={commit}
        />
      )}
      {typeof document !== 'undefined' &&
        previewActiveSrc &&
        previewGeom &&
        createPortal(
          <div
            className={styles.comboboxPreviewPopout}
            style={{ left: previewGeom.left, top: previewGeom.top }}
            aria-hidden
          >
            <img src={previewActiveSrc} alt="" decoding="async" draggable={false} />
          </div>,
          document.body
        )}
    </>
  );
}
