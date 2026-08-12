import type { ReactFormExtendedApi } from '@tanstack/react-form';

import type { Faction } from '@db/factions';

/** `useForm` with no custom form-level validators — matches default `ReactFormExtendedApi` slots. */
type DefaultReactFormApi<TFormData> = ReactFormExtendedApi<
  TFormData,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined
>;

export type FactionFormApi = DefaultReactFormApi<Faction>;
