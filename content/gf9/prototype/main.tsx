/** Three throwaway document compositions, switchable on one local review route. */
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { RulebookPageRenderer } from '../../../src/game/rulebook/RulebookRenderer';
import { AssetRenderModeProvider } from '../../../src/game/assets/assetRenderMode';
import { allCases, variants, renderPages, settingsFor, referenceImage } from './compositions';
import type { Variant } from './compositions';
import './prototype.css';

function PrototypePaper({ caseId, variant, leafIndex }: { caseId: string; variant: Variant; leafIndex?: number }) {
  const item = allCases.find(item => item.id === caseId)!;
  const precedingLeaves = allCases.slice(0, allCases.findIndex(item => item.id === caseId)).reduce((count, item) => count + renderPages(item.id, variant).length, 0);
  return <>{renderPages(caseId, variant).map((page, index) => leafIndex !== undefined && index !== leafIndex ? null : <div className="proof-paper" data-format={item.format} data-case={page.id} data-variant={variant} key={page.id}>
    <AssetRenderModeProvider mode="print"><RulebookPageRenderer page={page} settings={settingsFor(caseId)} pageNumber={precedingLeaves + 1 + index} /></AssetRenderModeProvider>
  </div>)}</>;
}
function ImagePaper({ image, format }: { image: string; format: string }) {
  return <div className="reference-paper" data-format={format}><img src={image} alt="Complete reference page at its physical aspect ratio" /></div>;
}
function App() {
  const initial = new URLSearchParams(location.search);
  const [variant, setVariant] = useState<Variant>((initial.get('variant') as Variant) || 'A');
  const [caseId, setCase] = useState(initial.get('case') || 'core-setup');
  const [scale, setScale] = useState(Number(initial.get('zoom') || '50'));
  const [comparison, setComparison] = useState(initial.get('view') !== 'proposed');
  const print = initial.get('print') === '1';
  const comparisonPrint = initial.get('print') === 'comparison';
  const item = allCases.find(item => item.id === caseId)!;
  const selected = variants.find(item => item.key === variant) || variants[0];
  const changeVariant = (delta: number) => setVariant(variants[(variants.findIndex(item => item.key === variant) + delta + variants.length) % variants.length].key);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set('variant', variant); params.set('case', caseId); params.set('zoom', String(scale)); params.set('view', comparison ? 'comparison' : 'proposed');
    history.replaceState(null, '', '?' + params);
    const listener = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (event.key === 'ArrowLeft') changeVariant(-1);
      if (event.key === 'ArrowRight') changeVariant(1);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [variant, caseId, scale, comparison]);
  useEffect(() => {
    document.documentElement.dataset.prototypeReady = 'loading';
    let cancelled = false;
    (async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; })));
      if (!cancelled) document.documentElement.dataset.prototypeReady = 'ready';
    })();
    return () => { cancelled = true; };
  }, [variant, caseId, comparison]);
  if (comparisonPrint) return <div className="comparison-print-pack">{allCases.flatMap(item => renderPages(item.id, variant).map((page, index) => <section className="comparison-spread" key={page.id}>
    <h1>{item.title}{index ? ' continued' : ''} | Variant {variant} | matching physical scale</h1>
    <div className="comparison-spread-columns">
      <section><h2>Original GF9</h2><ImagePaper image={'/reference/' + referenceImage(item.id) + '.png'} format={item.format} /></section>
      <section><h2>First delivery, archived</h2><ImagePaper image={'/current/' + item.id + '.png'} format="current-a4" /></section>
      <section><h2>Proposed composition</h2><PrototypePaper caseId={item.id} variant={variant} leafIndex={index} /></section>
    </div>
  </section>))}</div>;
  if (print) return <div className="print-pack">{allCases.map(item => <PrototypePaper key={item.id} caseId={item.id} variant={variant} />)}</div>;
  return <>
    <header className="review-header">
      <p className="eyebrow">Throwaway document prototype</p>
      <h1>GF9 book composition review</h1>
      <p>Compare the original, the first delivery and a proposed composition at the same millimetre scale.</p>
      <div className="review-controls">
        <label>Sample <select value={caseId} onChange={event => setCase(event.target.value)}>{allCases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Scale <select value={scale} onChange={event => setScale(Number(event.target.value))}>{[35, 50, 65, 80, 100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
        <label><input type="checkbox" checked={comparison} onChange={event => setComparison(event.target.checked)} /> Compare references</label>
        <a href={`?print=1&variant=${variant}`} target="_blank">Print sample pack</a>
      </div>
      <p className="scope-note">A page-design discussion, not the working local database or a complete revised book. The first-delivery references are archived output. All variants use the same sample rules.</p>
    </header>
    <main className="review-stage">
      <div className="comparison" style={{ zoom: scale / 100 }}>
        {comparison ? <>
          <section className="comparison-column"><h2>Original GF9</h2><p>{item.format === 'core-square' ? '254 × 254 mm' : '132.08 × 254 mm'}</p><ImagePaper image={'/reference/' + referenceImage(caseId) + '.png'} format={item.format} /></section>
          <section className="comparison-column"><h2>First delivery</h2><p>210 × 297 mm · Archived production PDF</p><ImagePaper image={'/current/' + caseId + '.png'} format="current-a4" /></section>
        </> : null}
        <section className="comparison-column"><h2>{selected.key}. {selected.name}</h2><p>{selected.description}</p><PrototypePaper caseId={caseId} variant={variant} /></section>
      </div>
      <details className="review-evidence"><summary>Review evidence and scope</summary>
        <p>Page sizes are fixed to the measured originals. Covers retain their complete original image without an extra gradient, title or logo. Interior text uses ordered existing Blocks and named layout regions. No paragraph coordinates or FAQ entries.</p>
        {'sourceReferences' in item ? <><p>Sample scope: {item.subtitle}</p><ul>{item.sourceReferences.map(reference => <li key={reference}>{reference}</li>)}</ul><p>The original and first-delivery selections may span several pages. This preview shows a representative page; see content-notes.md for the full mapping.</p></> : <p>Cover input is the complete page 1 of the corresponding original GF9 PDF, rendered at 300 dpi. Embedded raster art keeps its source quality.</p>}
        <p>Prototype-only changes: exact format catalogue entries and a scoped full-cover shading override. These are review code and must be rewritten and verified before production.</p>
      </details>
    </main>
    {import.meta.env.DEV ? <nav className="prototype-switcher" aria-label="Prototype variation"><button onClick={() => changeVariant(-1)} aria-label="Previous variation">←</button><span>{selected.key} · {selected.name}</span><button onClick={() => changeVariant(1)} aria-label="Next variation">→</button></nav> : null}
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
