export const mediaSubjects = [
  { value: 'weapons', label: 'Weapons & defense' },
  { value: 'people', label: 'People & anatomy' },
  { value: 'creatures', label: 'Creatures & aliens' },
  { value: 'plants', label: 'Plants & fungi' },
  { value: 'water', label: 'Water & fluids' },
  { value: 'transport', label: 'Travel & transport' },
  { value: 'machines', label: 'Machines & tools' },
  { value: 'places', label: 'Buildings & places' },
  { value: 'space', label: 'Space & worlds' },
  { value: 'symbols', label: 'Symbols & geometry' },
  { value: 'patterns', label: 'Textures & patterns' },
  { value: 'culture', label: 'Culture & ritual' },
  { value: 'science', label: 'Science & medicine' },
  { value: 'trade', label: 'Trade & supplies' },
] as const;

export function subjectLabel(value: string) {
  return mediaSubjects.find((subject) => subject.value === value)?.label ?? value;
}
