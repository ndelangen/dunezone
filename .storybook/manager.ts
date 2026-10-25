import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

import './playDebugger/manager';

addons.setConfig({
  theme: create({
    base: 'dark',
    appPreviewBg: '#333333',
  }),
});
