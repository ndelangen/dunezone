import { api } from '../../../convex/_generated/api';
import { db } from './core';

export const requestHomepageTicket = () => db.mutation(api.homepageAdmission.issueTicket, {});
