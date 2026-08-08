// PROTOTYPE — throwaway setup for the combined-coverage experiment.
import { setProjectAnnotations } from '@storybook/tanstack-react';
import { beforeAll } from 'vitest';

import * as projectAnnotations from './preview';

const annotations = setProjectAnnotations([projectAnnotations]);

beforeAll(annotations.beforeAll);
