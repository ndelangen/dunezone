import { z } from 'zod';

import { FAQ_TAG_VALUES } from './tags';

export const faqQuestionSchema = z.string().trim().min(1, 'Question is required');

export const faqAnswerSchema = z.string().trim().min(1, 'Answer is required');
const faqTagSchema = z.enum(FAQ_TAG_VALUES);
export const faqTagsSchema = z.array(faqTagSchema).min(1, 'Select at least one tag');
