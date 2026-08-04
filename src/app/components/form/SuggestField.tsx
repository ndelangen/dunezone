import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './SuggestField.module.css';
import type { TextFieldAppearance } from './TextField';
import { TextField } from './TextField';

export interface SuggestFieldProps {
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  optionToLabel?: (raw: string) => string;
  optionToSearchText?: (raw: string) => string;
  optionToPreviewSrc?: (raw: string) => string | null | undefined;
  renderOption?: (raw: string) => ReactNode;
  id?: string;
  placeholder?: string;
  appearance?: TextFieldAppearance;
}

type ListGeom = { top: number; left: number; width: number };
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

export function SuggestField({
  value,
  onChange,
  options,
  optionToLabel = identityOptionLabel,
  optionToSearchText = identityOptionSearchText,
  optionToPreviewSrc,
  renderOption,
  id: idProp,
  placeholder = 'Type to search…',
  appearance,
}: SuggestFieldProps) {
  const reactId = useId();
  const id = idProp ?? `suggest-${reactId}`;
  const listId = `${id}-listbox`;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(optionToLabel(value));
  const [highlight, setHighlight] = useState(0);
  const [listGeom, setListGeom] = useState<ListGeom | null>(null);
  const [previewGeom, setPreviewGeom] = useState<{ left: number; top: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef(0);
  const flatRef = useRef<string[]>([]);
  const openRef = useRef(open);

  useEffect(() => {
    setText(optionToLabel(value));
  }, [value, optionToLabel]);

  const partition = useMemo(
    () => partitionOptions(options, text, optionToLabel, optionToSearchText),
    [options, optionToLabel, optionToSearchText, text]
  );

  highlightRef.current = highlight;
  flatRef.current = partition.flat;

  useEffect(() => {
    if (highlight >= partition.flat.length) {
      setHighlight(Math.max(0, partition.flat.length - 1));
    }
  }, [partition.flat.length, highlight]);

  const updateListPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const gap = 4;
    setListGeom({ top: Math.ceil(r.bottom) + gap, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open || options.length === 0) {
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
  }, [open, options.length, updateListPosition]);

  const showList = open && options.length > 0 && listGeom != null;
  const showListRef = useRef(showList);
  openRef.current = open;
  showListRef.current = showList;

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

  // oxlint-disable-next-line react/exhaustive-deps -- Keep preview synced to active option and list layout.
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
      const flat = flatRef.current;
      const option = flat[h];
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
      const ir = inputEl.getBoundingClientRect();
      const optId = `${id}-opt-${h}`;
      const optEl = portalRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optId)}`) ?? null;

      let left = ir.left - PREVIEW_SIZE - PREVIEW_GAP;
      if (left < VIEWPORT_PAD) {
        left = ir.right + PREVIEW_GAP;
      }

      const or = optEl?.getBoundingClientRect();
      const anchorTop = or ? or.top + or.height / 2 : ir.top + ir.height / 2;
      const top = Math.min(
        Math.max(VIEWPORT_PAD, anchorTop - PREVIEW_SIZE / 2),
        window.innerHeight - PREVIEW_SIZE - VIEWPORT_PAD
      );
      setPreviewGeom({ left, top });
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
  }, [open, showList, highlight, id, listGeom, optionToPreviewSrc, partition.flat]);

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
    const t = text.trim();
    const exact = options.find((o) => o === t);
    if (exact) {
      commit(exact);
      return;
    }
    const lower = t.toLowerCase();
    const one = options.filter((o) => o.toLowerCase() === lower);
    if (one.length === 1) {
      commit(one[0]);
      return;
    }
    const exactLabel = options.filter((o) => optionToLabel(o) === t);
    if (exactLabel.length === 1) {
      commit(exactLabel[0]);
      return;
    }
    const lowerLabel = options.filter((o) => optionToLabel(o).toLowerCase() === lower);
    if (lowerLabel.length === 1) {
      commit(lowerLabel[0]);
      return;
    }
    setText(optionToLabel(value));
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
  const includedLabel = hasFilter ? 'Likely matches' : 'All options';
  const excludedLabel = 'Other options';
  const noMatchesOnly =
    hasFilter && partition.included.length === 0 && partition.excluded.length > 0;

  const selectedOption = showList ? partition.flat[highlight] : undefined;
  const previewActiveSrc =
    optionToPreviewSrc && selectedOption ? optionToPreviewSrc(selectedOption) : null;

  const portal =
    typeof document !== 'undefined' &&
    showList &&
    listGeom &&
    createPortal(
      <div
        ref={portalRef}
        id={listId}
        className={styles.comboboxListPortal}
        style={{
          top: listGeom.top,
          left: listGeom.left,
          width: listGeom.width,
        }}
      >
        {noMatchesOnly ? (
          <div className={styles.comboboxSection}>
            <div className={styles.comboboxSectionLabel}>No substring match — all options</div>
            {partition.excluded.map((opt, j) => {
              const i = j;
              return (
                <button
                  key={opt}
                  id={`${id}-opt-${i}`}
                  type="button"
                  className={i === highlight ? styles.comboboxOptionActive : styles.comboboxOption}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commit(opt)}
                >
                  {renderOption ? renderOption(opt) : optionToLabel(opt)}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className={styles.comboboxSection}>
              <div className={styles.comboboxSectionLabel}>{includedLabel}</div>
              {partition.included.map((opt, j) => {
                const i = j;
                return (
                  <button
                    key={opt}
                    id={`${id}-opt-${i}`}
                    type="button"
                    className={
                      i === highlight ? styles.comboboxOptionActive : styles.comboboxOption
                    }
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => commit(opt)}
                  >
                    {renderOption ? renderOption(opt) : optionToLabel(opt)}
                  </button>
                );
              })}
            </div>
            {partition.excluded.length > 0 && (
              <div className={styles.comboboxSection}>
                <div className={styles.comboboxSectionDivider} />
                <div className={styles.comboboxSectionLabel}>{excludedLabel}</div>
                {partition.excluded.map((opt, j) => {
                  const i = partition.included.length + j;
                  return (
                    <button
                      key={opt}
                      id={`${id}-opt-${i}`}
                      type="button"
                      className={
                        i === highlight ? styles.comboboxOptionActive : styles.comboboxOption
                      }
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => commit(opt)}
                    >
                      {renderOption ? renderOption(opt) : optionToLabel(opt)}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>,
      document.body
    );

  const previewPortal =
    typeof document !== 'undefined' &&
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
    );

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
            showList && partition.flat[highlight] ? `${id}-opt-${highlight}` : undefined
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
      {portal}
      {previewPortal}
    </>
  );
}
