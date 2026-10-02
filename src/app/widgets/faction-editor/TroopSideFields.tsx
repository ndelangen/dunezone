import { Box, ColorInput, NumberInput, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import type { NumberInputProps } from '@mantine/core';
import { TROOP, TROOP_MODIFIER } from '@shared/assetIds';
import { completeCombat } from '@shared/factions/troopCombat';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { useEffect, useState } from 'react';

import type { Faction } from '@db/factions';

import { assetOptionToPreviewSrc, troopStarOptionToLabel } from './factionFormAssetUtils';
import { nextTroopCombat } from './factionFormDefaults';
import type { FactionFormApi } from './factionFormTypes';

const troopImageOptions = stockAssetOptions(TROOP.options);

/* The -red variants predate the star color field and are redundant with it: the editor
   offers only the base stars, while the schema and renderer keep accepting stored -red
   values so unedited factions render unchanged. */
const troopStarOptions = TROOP_MODIFIER.options
  .filter((value) => !value.includes('-red'))
  .map((value) => ({
    value,
    label: troopStarOptionToLabel(value),
  }));

/* The exact red the renderer paints for a -red star with no hue set (see starHue in Troop.tsx). */
const LEGACY_RED_STAR_HUE = '#ff0000';

type StarValue = Faction['troops'][number]['star'];

/* Normalizes a stored legacy -red star the moment its field renders (the planet auto-pick
   pattern, deliberate and ruled on wayfinder #488): a visible draft change to the modern shape,
   the base star plus the renderer's red in the hue field, never a silent rewrite of anything the
   color field already overrides. Rendering the field is the touch; no interaction is awaited. */
function StarModifierSelect({
  id,
  title,
  value,
  hue,
  onChange,
  onNormalize,
}: {
  id: string;
  title: string;
  value: StarValue;
  hue: string | undefined;
  onChange: (value: StarValue) => void;
  onNormalize: (base: NonNullable<StarValue>, hue: string | undefined) => void;
}) {
  const legacyRed = value != null && value.includes('-red');

  useEffect(() => {
    if (legacyRed && value != null) {
      onNormalize(value.replace('-red', '') as NonNullable<StarValue>, hue ?? LEGACY_RED_STAR_HUE);
    }
  }, [legacyRed, value, hue, onNormalize]);

  return (
    <AssetSelect
      id={id}
      aria-label={title}
      placeholder="No star modifier"
      clearable
      data={troopStarOptions}
      getPreviewSrc={assetOptionToPreviewSrc}
      glyphPreviews
      value={legacyRed ? null : (value ?? null)}
      onChange={(next) => onChange(next ? (next as NonNullable<StarValue>) : undefined)}
    />
  );
}

/** The value typed text commits: a number, undefined for an emptied field, or null for text that is not a usable value. */
function committedNumber(text: string | number, whole: boolean): number | undefined | null {
  if (text === '') {
    return undefined;
  }
  const value = typeof text === 'number' ? text : Number(text);
  if (!Number.isFinite(value)) {
    return null;
  }
  return whole && !(Number.isSafeInteger(value) && value >= 0) ? null : value;
}

/*
 * Mantine reports text like `1.` or `-` as a string while the author is still typing a fraction.
 * The draft keeps that text local and commits one complete value on blur or Enter, as the battle planner's inputs do.
 */
function CombatNumberInput({
  value,
  whole,
  onCommit,
  ...props
}: Omit<NumberInputProps, 'value' | 'onChange' | 'onBlur'> & {
  value: number | undefined;
  whole: boolean;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | number | null>(null);
  return (
    <NumberInput
      {...props}
      min={whole ? 0 : undefined}
      allowDecimal={!whole}
      allowNegative={!whole}
      value={draft ?? value ?? ''}
      onChange={setDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const next = draft === null ? null : committedNumber(draft, whole);
        if (next !== null && next !== value) {
          onCommit(next);
        }
        setDraft(null);
      }}
    />
  );
}

/*
 * A face's battle eligibility and the values a battle plan reads from it (#1062).
 * Empty strengths stay empty: the authoring warning and a game's capture name the gap instead of reading it as zero.
 */
function TroopCombatFields({
  form,
  troopIndex: i,
  side,
  idBase,
}: {
  form: FactionFormApi;
  troopIndex: number;
  side: 'front' | 'back';
  idBase: string;
}) {
  const isBack = side === 'back';
  const capableField = isBack ? (`troops[${i}].back.capable` as const) : (`troops[${i}].capable` as const);
  const combatField = isBack ? (`troops[${i}].back.combat` as const) : (`troops[${i}].combat` as const);
  const inputs = [
    {
      key: 'strength',
      title: 'Strength',
      description: 'What one undialed troop adds. May be fractional or negative.',
      whole: false,
    },
    {
      key: 'supportedStrength',
      title: 'Supported strength',
      description: 'What one dialed troop adds instead. May be fractional or negative.',
      whole: false,
    },
    {
      key: 'supportCost',
      title: 'Support cost',
      description: 'Spice to dial one troop; one when left empty, and zero is free.',
      whole: true,
    },
  ] as const;

  return (
    <form.Field name={capableField}>
      {(capable) => (
        <Stack gap="md">
          <ControlBlock
            title={isBack ? 'Back side fights in battle' : 'Fights in battle'}
            description="Off keeps this side out of the battle planner, whatever its strengths."
            input={
              <Switch
                id={`${idBase}-capable`}
                aria-label={isBack ? 'Back side fights in battle' : 'Fights in battle'}
                checked={capable.state.value !== false}
                onBlur={capable.handleBlur}
                onChange={(event) => capable.handleChange(event.currentTarget.checked ? undefined : false)}
              />
            }
          />
          {capable.state.value !== false ? (
            <form.Field name={combatField}>
              {(combat) => (
                <Stack gap="xs">
                  <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    {inputs.map(({ key, title, description, whole }) => {
                      const label = isBack ? `Back-side ${title.toLowerCase()}` : title;
                      return (
                        <ControlBlock
                          key={key}
                          title={label}
                          description={description}
                          input={
                            <CombatNumberInput
                              id={`${idBase}-${key}`}
                              aria-label={label}
                              placeholder={whole ? '1' : 'Not set'}
                              step={whole ? 1 : 0.5}
                              whole={whole}
                              value={combat.state.value?.[key]}
                              onCommit={(value) => {
                                combat.handleChange(nextTroopCombat(combat.state.value, key, value));
                                combat.handleBlur();
                              }}
                            />
                          }
                        />
                      );
                    })}
                  </SimpleGrid>
                  {completeCombat(combat.state.value) === null ? (
                    <Text id={`${idBase}-combat-warning`} c="var(--color-caution)" size="xs" role="status">
                      Enter both strengths to use this side in battle. Until then a game leaves it out of battle plans.
                    </Text>
                  ) : null}
                </Stack>
              )}
            </form.Field>
          ) : null}
        </Stack>
      )}
    </form.Field>
  );
}

export function TroopSideFields({
  form,
  troopIndex,
  side,
}: {
  form: FactionFormApi;
  troopIndex: number;
  side: 'front' | 'back';
}) {
  const isBack = side === 'back';
  const idBase = isBack ? `troop-${troopIndex}-back` : `troop-${troopIndex}`;
  const i = troopIndex;
  const nameField = isBack ? (`troops[${i}].back.name` as const) : (`troops[${i}].name` as const);
  const imageField = isBack ? (`troops[${i}].back.image` as const) : (`troops[${i}].image` as const);
  const descField = isBack ? (`troops[${i}].back.description` as const) : (`troops[${i}].description` as const);
  const starField = isBack ? (`troops[${i}].back.star` as const) : (`troops[${i}].star` as const);
  const hueField = isBack ? (`troops[${i}].back.hue` as const) : (`troops[${i}].hue` as const);
  const stripedField = isBack ? (`troops[${i}].back.striped` as const) : (`troops[${i}].striped` as const);

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={nameField}>
          {(field) => {
            const title = isBack ? 'Back-side name' : 'Troop name';
            return (
              <ControlBlock
                title={title}
                description={
                  isBack
                    ? 'Name printed for the reverse side of this physical troop.'
                    : 'Used on the troop token and faction sheet.'
                }
                input={
                  <TextInput
                    id={`${idBase}-name`}
                    aria-label={title}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                }
              />
            );
          }}
        </form.Field>

        <form.Field name={imageField}>
          {(field) => {
            const title = isBack ? 'Back-side symbol' : 'Troop symbol';
            return (
              <ControlBlock
                title={title}
                input={
                  <AssetSelect
                    id={`${idBase}-img`}
                    aria-label={title}
                    allowDeselect={false}
                    data={troopImageOptions}
                    getPreviewSrc={assetOptionToPreviewSrc}
                    glyphPreviews
                    value={field.state.value ?? null}
                    onChange={(value) => {
                      if (value) {
                        field.handleChange(value as Faction['troops'][number]['image']);
                      }
                    }}
                  />
                }
              />
            );
          }}
        </form.Field>
      </SimpleGrid>

      <form.Field name={descField}>
        {(field) => {
          const title = isBack ? 'Back-side description' : 'Troop description';
          return (
            <ControlBlock
              title={title}
              description="Used as the troop rules description on the faction sheet."
              input={
                <FormattedTextInput
                  id={`${idBase}-desc`}
                  aria-label={title}
                  autosize
                  minRows={2}
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              }
            />
          );
        }}
      </form.Field>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <form.Field name={starField}>
          {(field) => {
            const title = isBack ? 'Back-side star modifier' : 'Star modifier';
            return (
              <ControlBlock
                title={title}
                input={
                  <StarModifierSelect
                    id={`${idBase}-star`}
                    title={title}
                    value={field.state.value}
                    hue={
                      form.state.values.troops[i]
                        ? isBack
                          ? form.state.values.troops[i].back?.hue
                          : form.state.values.troops[i].hue
                        : undefined
                    }
                    onChange={field.handleChange}
                    onNormalize={(base, hue) => {
                      field.handleChange(base);
                      form.setFieldValue(hueField, hue);
                    }}
                  />
                }
              />
            );
          }}
        </form.Field>

        <form.Field name={hueField}>
          {(field) => {
            const title = isBack ? 'Back-side star color' : 'Star color';
            return (
              <ControlBlock
                title={title}
                description="Optional color for the star modifier; cream when unset."
                input={
                  <ColorInput
                    id={`${idBase}-hue`}
                    aria-label={title}
                    placeholder="Default"
                    value={field.state.value ?? ''}
                    onBlur={field.handleBlur}
                    onChangeEnd={(value) => field.handleChange(value ? value : undefined)}
                  />
                }
              />
            );
          }}
        </form.Field>

        <Box pt={{ base: 0, sm: 'xl' }}>
          <form.Field name={stripedField}>
            {(field) => {
              const title = isBack ? 'Striped reverse token' : 'Striped troop token';
              return (
                <ControlBlock
                  title={title}
                  description="Adds the striped treatment to this side only."
                  input={
                    <Switch
                      id={`${idBase}-striped`}
                      aria-label={title}
                      checked={field.state.value === true}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.checked ? true : undefined)}
                    />
                  }
                />
              );
            }}
          </form.Field>
        </Box>
      </SimpleGrid>

      <TroopCombatFields form={form} troopIndex={i} side={side} idBase={idBase} />
    </Stack>
  );
}
