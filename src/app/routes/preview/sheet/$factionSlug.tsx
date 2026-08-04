import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

import { loadFactionBySlug, useFaction } from '@db/factions';
import '@app/components/factions/sheet/FactionSheetDocument.css';
import { FactionSheetView } from '@app/components/factions/sheet/FactionSheetView';
import { useFactionSheetPostMessage } from '@app/hooks/useFactionSheetPostMessage';

export const Route = createFileRoute('/preview/sheet/$factionSlug')({
  validateSearch: (params: Record<string, unknown>): { mode: 'db' | 'live' } => {
    return params.mode === 'live' ? { mode: 'live' } : { mode: 'db' };
  },
  loader: async ({ params, location }) => {
    // Loader deps do not include validated `search`; parse query string (matches validateSearch).
    const mode = new URLSearchParams(location.search).get('mode') ?? 'db';
    if (mode === 'live') {
      return undefined;
    }
    return await loadFactionBySlug(params.factionSlug);
  },
  component: FactionSheetPage,
});

function FactionSheetDbMode() {
  const { factionSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { faction } = useFaction(factionSlug, { initialData: loaderData });

  useEffect(() => {
    document.documentElement.dataset.factionSheet = '';
    return () => {
      delete document.documentElement.dataset.factionSheet;
    };
  }, []);

  if (!faction) {
    return null;
  }

  return <FactionSheetView faction={faction.data} />;
}

function FactionSheetLiveMode() {
  const factionFromMessage = useFactionSheetPostMessage(true);

  useEffect(() => {
    document.documentElement.dataset.factionSheet = '';
    return () => {
      delete document.documentElement.dataset.factionSheet;
    };
  }, []);

  if (!factionFromMessage) {
    return (
      <p style={{ margin: '1rem', fontFamily: 'system-ui, sans-serif' }}>
        Live preview: waiting for faction data via <code>postMessage</code> (same origin).
      </p>
    );
  }

  return <FactionSheetView faction={factionFromMessage} />;
}

function FactionSheetPage() {
  const { mode } = Route.useSearch();
  if (mode === 'live') {
    return <FactionSheetLiveMode />;
  }
  return <FactionSheetDbMode />;
}
