import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@app/components/factions/sheet/FactionSheetDocument.css';
import '@app/styles/fonts.css';
import '@app/styles/tokens.css';

import '@fontsource/caladea/latin-400.css';
import '@fontsource/caladea/latin-400-italic.css';
import '@fontsource/caladea/latin-700.css';
import '@fontsource/caladea/latin-700-italic.css';
import './capture-document.css';
import { PublisherFactionSheetCapture } from './PublisherFactionSheetCapture';

const root = document.querySelector('#root');
if (!root) {
  throw new Error('Missing capture root');
}

createRoot(root).render(
  <StrictMode>
    <PublisherFactionSheetCapture />
  </StrictMode>
);
