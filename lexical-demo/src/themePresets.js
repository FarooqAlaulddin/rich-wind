// Design systems the demo can compile a page under. The demo server answers
// resolveTheme from this list through the design-tokens plugin, keyed by a
// project id suffix, so visitors pick a theme but can never write one.
//
// Ink and Harbor name the same tokens with different values: one page written
// in `bg-paper text-ink rounded-card` takes either brand, and Tailwind's own
// palette (`bg-indigo-600`) is rejected under both.

export const THEMES = [
  {
    id: 'stock',
    label: 'Tailwind',
    hint: "Tailwind's stock theme. Token classes like bg-paper do not exist here.",
    tokens: null,
  },
  {
    id: 'ink',
    label: 'Ink',
    hint: 'An editorial system: black on paper, a serif display face, square cards.',
    tokens: `@theme {
  --color-ink: #16130f;
  --color-paper: #f7f3ea;
  --color-muted: #6f675b;
  --color-line: #d9d0bf;
  --color-accent: #b4351f;
  --color-on-accent: #ffffff;
  --font-display: Georgia, "Times New Roman", serif;
  --font-body: Georgia, "Times New Roman", serif;
  --radius-card: 2px;
  --shadow-card: 0 1px 0 #d9d0bf;
}`,
  },
  {
    id: 'harbor',
    label: 'Harbor',
    hint: 'A product system: navy on sand, a sans face, soft round cards.',
    tokens: `@theme {
  --color-ink: #0f2742;
  --color-paper: #fdfaf4;
  --color-muted: #5b6b7d;
  --color-line: #e3dccd;
  --color-accent: #1f7a8c;
  --color-on-accent: #ffffff;
  --font-display: ui-sans-serif, system-ui, sans-serif;
  --font-body: ui-sans-serif, system-ui, sans-serif;
  --radius-card: 18px;
  --shadow-card: 0 10px 30px -12px rgb(15 39 66 / 0.35);
}`,
  },
];

const SEPARATOR = '.theme-';

/** The project id a page compiles under for one theme. */
export function themedProjectId(projectId, themeId) {
  return `${projectId}${SEPARATOR}${themeId}`;
}

/** The token file for a project id, or null for stock and for any other project. */
export function tokensForProject(projectId) {
  const at = String(projectId).lastIndexOf(SEPARATOR);
  if (at === -1) return null;
  const id = projectId.slice(at + SEPARATOR.length);
  return THEMES.find((t) => t.id === id)?.tokens ?? null;
}
