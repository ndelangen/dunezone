/* Applies the project's Storybook annotations (decorators, parameters) to
   stories running as Vitest browser-mode tests. */
import { setProjectAnnotations } from '@storybook/tanstack-react';
import { beforeAll } from 'vitest';

import preview from './preview';

const annotations = setProjectAnnotations([preview.composed]);

beforeAll(annotations.beforeAll);
