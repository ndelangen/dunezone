/** Read-only, throwaway comparison of GF9 component treatments. No application mutations. */
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import '../../../src/app/styles/fonts.css';
import '@fontsource/caladea/400.css';
import '@fontsource/caladea/700.css';
import { AssetRenderModeProvider } from '../../../src/game/assets/assetRenderMode';
import { ArtReview } from './art';
import { FactionReview } from './factions';
import { HeaderReview } from './headers';
import { LabelReview } from './labels';
import { RemainingCardsReview } from './remaining-cards';
import './prototype.css';
const params = new URLSearchParams(location.search);
const variant = (['A', 'B', 'C'].includes(params.get('variant') ?? '') ? params.get('variant') : 'A') as
  | 'A'
  | 'B'
  | 'C';
const cases = [
  { key: 'art', label: 'Logo and original portraits' },
  { key: 'headers', label: 'Full names and card headers' },
  { key: 'factions', label: 'Faction sheets and complete clauses' },
  { key: 'labels', label: 'Discovery Spice cards' },
];
const selected = cases.some((c) => c.key === params.get('case')) ? params.get('case')! : 'art';
const factionCase = params.get('faction') ?? 'bene-gesserit';
const sheetPage = params.get('sheetPage') === '1' ? 1 : 2;
const variants = [
  { key: 'A', name: 'Fitted single line' },
  { key: 'B', name: 'Balanced two lines' },
  { key: 'C', name: 'Rearranged header' },
];
function navigate(patch: Record<string, string>) {
  const query = new URLSearchParams(location.search);
  Object.entries(patch).forEach(([key, value]) => query.set(key, value));
  location.assign('?' + query.toString());
}
function App() {
  useEffect(() => {
    const cycle = (delta: number) =>
      navigate({ variant: variants[(variants.findIndex((v) => v.key === variant) + delta + 3) % 3].key });
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    document.fonts.ready.then(() => {
      document.documentElement.dataset.prototypeReady = 'ready';
    });
  }, []);
  return (
    <>
      <header className="review-heading">
        <p className="eyebrow">GF9 correction review</p>
        <h1>{selected === 'labels' ? 'Discovery Spice cards' : 'Faction, logo and component treatments'}</h1>
        <p>
          {selected === 'labels'
            ? 'Focused review of the remaining card corrections. Previously accepted treatments stay settled.'
            : 'Compare the proposed corrections with the existing data and original artwork. Rulebook covers and page compositions are already accepted.'}
        </p>
        <nav aria-label="Review cases">
          {cases.map((c) => (
            <button
              key={c.key}
              aria-current={c.key === selected ? 'page' : undefined}
              onClick={() => navigate({ case: c.key })}
            >
              {c.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {selected === 'art' ? (
          <ArtReview variant={variant} />
        ) : selected === 'headers' ? (
          <HeaderReview variant={variant} />
        ) : selected === 'labels' ? (
          params.get('review') === 'archive' ? (
            <LabelReview />
          ) : (
            <RemainingCardsReview />
          )
        ) : (
          <>
            <nav className="faction-case-nav" aria-label="Sheet examples">
              {[
                { key: 'bene-gesserit', label: 'Bene Gesserit connector', page: '2' },
                { key: 'ecaz', label: 'Ecaz and Duke Vidal', page: '1' },
                { key: 'choam', label: 'CHOAM background', page: '1' },
                { key: 'reversible-example', label: 'Other reversible troops', page: '2' },
              ].map((item) => (
                <button key={item.key} onClick={() => navigate({ faction: item.key, sheetPage: item.page })}>
                  {item.label}
                </button>
              ))}
            </nav>
            <FactionReview faction={factionCase} page={sheetPage} />
          </>
        )}
      </main>
      <aside className="prototype-note">
        Read-only prototype. Changes affect this comparison only. The application and production content are not being
        edited.
      </aside>
      {selected === 'headers' && (
        <div className="variant-switcher" aria-label="Header treatment">
          <button
            onClick={() => navigate({ variant: variants[(variants.findIndex((v) => v.key === variant) + 2) % 3].key })}
            aria-label="Previous treatment"
          >
            ←
          </button>
          <span>
            {variant}: {variants.find((v) => v.key === variant)!.name}
          </span>
          <button
            onClick={() => navigate({ variant: variants[(variants.findIndex((v) => v.key === variant) + 1) % 3].key })}
            aria-label="Next treatment"
          >
            →
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <AssetRenderModeProvider mode="print">
    {params.get('frame') === 'sheet' ? (
      <FactionReview
        frame
        faction={params.get('faction') ?? 'bene-gesserit'}
        variant={params.get('variant') === 'baseline' ? 'baseline' : 'proposed'}
        page={params.get('sheetPage') === '1' ? 1 : 2}
      />
    ) : (
      <App />
    )}
  </AssetRenderModeProvider>
);
