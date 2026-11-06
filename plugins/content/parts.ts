// The curriculum's parts, in display order. Lesson frontmatter `part:` must
// use one of these names exactly.
export const PARTS = [
  'Foundations',
  'Collections',
  'Functions & Iteration',
  'Objects & Classes',
  'Robust Code',
  'Advanced Python',
] as const;

export type PartName = (typeof PARTS)[number];
