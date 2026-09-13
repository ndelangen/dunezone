/* The label and color of each public log classification, shared by compact and expanded records. */
export const LOG_CLASSIFICATIONS = {
  seat: { label: 'Seat', color: 'blue' },
  spice: { label: 'Spice', color: 'orange' },
  phase: { label: 'Phase', color: 'cyan' },
  battle: { label: 'Battle', color: 'red' },
  vote: { label: 'Vote', color: 'green' },
  prediction: { label: 'Prediction', color: 'grape' },
} as const;

export type LogClassification = keyof typeof LOG_CLASSIFICATIONS;
