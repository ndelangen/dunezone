import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const reviewSource = readFileSync(new URL('./FactionSheetReview.tsx', import.meta.url), 'utf8');
const reviewStyles = readFileSync(
  new URL('./FactionSheetReview.module.css', import.meta.url),
  'utf8'
);
const pagePreviewSource = readFileSync(
  new URL('./FactionSheetPagePreview.tsx', import.meta.url),
  'utf8'
);
const formFieldsSource = readFileSync(
  new URL('./FactionFormFields.tsx', import.meta.url),
  'utf8'
);
const editorSource = readFileSync(new URL('./FactionEditor.tsx', import.meta.url), 'utf8');

describe('adaptive faction sheet review architecture', () => {
  it('keeps review state local, lazy-mounts once, and retains the mounted renderer tree', () => {
    expect(reviewSource).not.toContain('@tanstack/react-router');
    expect(reviewSource).not.toContain('useNavigate');
    expect(reviewSource).not.toContain('location.hash');
    expect(reviewSource).toContain('const [reviewMounted, setReviewMounted] = useState(false)');
    expect(reviewSource).toContain('setReviewMounted(true)');
    expect(reviewSource).not.toContain('setReviewMounted(false)');
    expect(reviewSource).toContain('{reviewMounted ? (');
    expect(editorSource).toContain('<FactionSheetReview faction={values}>');
  });

  it('uses real isolated Sheet and Shield output without app-layer internal styling', () => {
    expect(reviewSource).toContain("from '@game/assets/faction/shield/Shield'");
    expect(reviewSource).toContain('<Shield {...renderProps} />');
    expect(reviewSource).toContain('<FactionSheetPagePreview');
    expect(pagePreviewSource).toContain("from '../sheet/FactionSheetView'");
    expect(pagePreviewSource).toContain('createPortal');
    expect(pagePreviewSource).toContain('<FactionSheetView faction={renderFaction} />');
    expect(pagePreviewSource).not.toContain('/preview/sheet');
    expect(pagePreviewSource).not.toContain('postMessage');
    expect(reviewStyles).not.toMatch(/\\.page_title|\\.page_subtitle|\\.rules|\\.troops/);
  });

  it('owns exact A4 sizing, bounded height, adaptive page layout, and scroll affordance', () => {
    expect(reviewStyles).toContain('aspect-ratio: 210 / 297');
    expect(reviewStyles).toContain('max-height: 100%');
    expect(reviewStyles).toContain('inset: 0 0 0 var(--editor-strip-width)');
    expect(reviewStyles).toContain('grid-template-columns: 1fr');
    expect(reviewStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(reviewStyles).toContain('@container faction-review-plane');
    expect(reviewStyles).toContain('scroll-snap-type: y proximity');
    expect(reviewSource).toContain('Scroll for page 2');
    expect(reviewSource).toContain('pagesShareRow');
  });

  it('uses the approved 520ms curves, animates exit, and honors reduced motion', () => {
    expect(reviewStyles).toContain('--review-duration: 520ms');
    expect(reviewStyles).toContain('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(reviewStyles).toContain('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(reviewStyles).toContain('transform var(--review-duration) var(--review-exit-ease)');
    expect(reviewStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(reviewStyles).toContain('transition: none');
  });

  it('keeps the editor inert, exposes every close path, and omits review on mobile', () => {
    expect(reviewSource).toContain('inert={reviewOpen ? true : undefined}');
    expect(reviewSource).toContain('Close sheet review and return to editing');
    expect(reviewSource).toContain('Return to editing');
    expect(reviewSource).toContain('Close faction sheet review');
    expect(reviewStyles).toContain('@media (max-width: 47.99em)');
    expect(reviewStyles).toContain('.reviewAction,');
    expect(reviewStyles).toContain('.reviewPanel,');
  });

  it('switches in-memory chapter tabs and exposes warning counts without URL state', () => {
    expect(formFieldsSource).toContain('<Tabs');
    expect(formFieldsSource).toContain('chapterWarnings.length');
    expect(formFieldsSource).not.toContain('navigate');
    expect(formFieldsSource).not.toContain('location.hash');
    expect(formFieldsSource).not.toContain('Accordion');
  });
});
