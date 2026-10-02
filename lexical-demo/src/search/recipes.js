// Recipes: what "calmer", "pricing card" or "make it pop" do, as data. A
// recipe is a short list of operations that run against the target's own
// classes, so the same word moves a blue card differently from a gray one.
//
// Operations (space separated, in recipe.ops):
//   +cls           add (a class of the same group is replaced)
//   -cls           remove that exact class if present
//   ~Label         remove every class of a catalog group ("~Shadow", "~Border_width")
//   ?cls           add only when the target has nothing in that group (a seed)
//   Label+N|seed   step the target's class of that group N steps (Label-N the other way);
//                  with none on the target the seed is added
//   shade:prop+N|seed   step the color shade of text, bg, border or ring (+ is darker)
//   shade:prop=900      set the shade;  shade:prop~600  move one step toward 600
//   fam:warm / fam:cool shift the color family of text, bg and border
// A "b:" prefix runs an operation on block targets only, "i:" on inline only.
//
// Flags: lite (at a plain or hedged request only the first two operations
// run), chain (only the first operation that changes something runs, unless
// the request is strong).
//
// Nothing here is a model output. Every class is checked against the catalog
// by tests/lexical-recipes.test.js.

import { lookup } from './catalogStore';
import { scrubClass } from './relative';
import { splitTokenSimple } from './tokens';
import { normalizePrefix } from './variants';
import { addClass } from '../classEdit';
import { groupOf } from '../classCatalog';
import { SHADES, FAMILIES } from './palette';
import { completePairs } from './pairs';

const R = (id, title, words, ops, extra = {}) => ({ id, title, words: words.split('|'), ops, ...extra });
const ALT = (title, ops) => ({ title, ops });

// ---------- Moods ----------

const MOODS = [
  R('pop', 'Make it pop', 'pop|stand out|standout|eye catching|punchy|pop out', 'Font_weight+1|font-semibold +shadow-md +ring-1 +ring-slate-200', { lite: true }),
  R('recede', 'Stand out less', 'recede|stand out less|blend in|less prominent|fade into the background', 'Shadow-1 +border-slate-200 shade:text-1|text-slate-500'),
  R('tone-down', 'Tone it down', 'tone it down|tone down|calm it down|dial it down|soften the look|subdue|subdued', 'Shadow-1 shade:text-1 Font_weight-1', { chain: true }),
  R('quieter', 'Quieter', 'quieter|quiet|less loud|hushed|hush', '+shadow-none +text-slate-600'),
  R('calm', 'Calmer', 'calm|calmer|calming|peaceful|relaxed|serene|soothing|zen|zen vibes|chill|mellow|tranquil', 'Font_weight-1 shade:text~600|text-slate-600 Line_height+1|leading-relaxed Shadow-1 ?bg-slate-50 ?border-slate-200'),
  R('elegant', 'Elegant', 'elegant|classy|refined|graceful|sophisticated|tasteful|dignified|upscale', 'Font_weight-1 Letter_spacing+1|tracking-wide Line_height+1|leading-relaxed b:+font-serif ?text-slate-800'),
  R('premium', 'Premium', 'premium|luxury|luxurious|high end|upmarket|expensive|fancy|posh|deluxe|exclusive', 'Border_radius+1|rounded-lg Shadow+1|shadow-md Padding+1|p-6 +tracking-wide +ring-1 +ring-slate-900/5 ?text-slate-900 ?bg-white ?border-slate-200'),
  R('confident', 'More confident', 'confident|assertive|authoritative|decisive|strong|powerful|commanding', '+font-semibold +text-slate-900'),
  R('friendlier', 'Friendlier', 'friendlier|friendly|playful|fun|cheerful|cute|warm and friendly|approachable|whimsical|bubbly|bouncy', 'Border_radius+2|rounded-xl +rounded-2xl Font_weight+1|font-semibold ?text-pink-700 ?bg-pink-100 ?border-pink-200'),
  R('serious', 'More serious', 'serious|professional|businesslike|formal|corporate|sober|grown up|official|business', '+rounded-md +shadow-sm +border +border-slate-300 +text-slate-900'),
  R('minimal', 'Minimal', 'minimal|minimalist|clean|cleaner|simpler|simple|stripped back|bare bones|uncluttered|decluttered|declutter|plain it', '~Shadow ~Border_width ~Ring -italic -underline -uppercase +tracking-normal', { lite: false }),
  R('brutalist', 'Brutalist', 'brutalist|brutalism|raw|neo brutalist', '+rounded-none +border-4 +border-black +font-black +shadow-none +uppercase +tracking-tight +bg-yellow-300 +text-black +p-4'),
  R('warm', 'Warmer', 'warm|warmer|cozy colors|earthy|inviting|toasty|homey', 'fam:warm ?text-stone-800 ?bg-stone-50 ?border-stone-200'),
  R('cool', 'Cooler', 'cool|cooler|icy|crisp colors|frosty|fresh|techy blue|chilly', 'fam:cool ?text-slate-800 ?bg-sky-50 ?border-sky-200'),
  R('dark', 'Dark version', 'dark|dark version|dark mode look|night|moody|dark theme|inverted dark|go dark', 'shade:bg=900|bg-slate-900 shade:text=100|text-slate-100 shade:border=700|border-slate-700'),
  R('light', 'Light version', 'light version|light theme|bright version|go light', '+bg-white +text-slate-900 +border-slate-200'),
  R('editorial', 'Editorial', 'editorial|magazine|literary|bookish|article|longform|essay', '+font-serif +leading-relaxed +text-slate-800 +text-pretty b:+max-w-prose'),
  R('techy', 'Technical', 'techy|technical|tech|developer|geeky|nerdy|hacker|terminal|monospace look', '+font-mono +text-sm +text-slate-700 b:+bg-zinc-950 b:+text-zinc-100 b:+border b:+border-zinc-800 b:+rounded-md b:+p-4'),
  R('airy', 'Airy', 'airy|light and airy|spacious feel|open feel|breezy|spacious', 'Padding+1|p-6 Line_height+1|leading-relaxed'),
  R('dense', 'Dense', 'dense|packed|compact feel|information dense|tight and dense', '+p-3 +leading-snug'),
  R('cozy', 'Cozy', 'cozy|snug feel|comfy|comfortable|homely', '+p-4 +rounded-lg +shadow-sm +bg-stone-50'),
  R('polished', 'Polished', 'polished|finished|sleek|slick|neat|tidy|well made|refined edges', '+rounded-lg +border +border-slate-200 +shadow-sm'),
  R('crisp', 'Crisp', 'crisp|sharp look|precise|clean edges|well defined', '+rounded-md +border +border-slate-300'),
  R('softer', 'Softer', 'softer|soften|gentler|gentle|softly|mellower', '+rounded-xl +shadow-sm +border-slate-200 shade:text-1'),
  R('less-loud', 'Less loud', 'less loud look|toned look', '+font-bold +text-slate-600 +shadow-none'),
  R('muted', 'Muted', 'muted|subtle text|dimmer text|greyed|grayed|greyed out|grayed out|washed out|desaturated|drab', 'shade:text~500|text-slate-500'),
  R('fade', 'Fade', 'fade|dim|ghost|ghostly|see through look|lower opacity', 'Opacity-1|opacity-70'),
  R('contrast', 'More contrast', 'contrast|more contrast|higher contrast|more readable|readable|legible|easier to see|easier to read text|stand out text', 'shade:text~900|text-slate-900 Font_weight+1|font-medium'),
  R('lift', 'Lift it', 'lift|lift it|lift off|raise|raised|more depth|depth|elevated|elevate|float|floating|3d|pop up', 'Shadow+1|shadow-md'),
  R('flat', 'Flat', 'flat|flatten|flat look|no depth|remove depth|flat design', '~Shadow ~Ring', { fallback: '+shadow-none' }),
  R('soft-shadow', 'Soft shadow', 'soft shadow|gentle shadow|light shadow|faint shadow|subtle shadow', '+shadow-sm', { alts: [ALT('Fainter', '+shadow-xs')] }),
  R('pressed', 'Pressed in', 'pressed in|pressed|inset|sunken|indented|debossed', '+inset-shadow-sm', { alts: [ALT('Lighter', '+inset-shadow-xs')] }),
  R('glow', 'Glow', 'glow|glowing|ring it|halo|aura|outline glow|highlight ring', '+ring-2 +ring-indigo-200'),
  R('selected', 'Looks selected', 'looks selected|selected|active look|chosen|picked', '+ring-2 +ring-blue-500 +ring-offset-2'),
  R('disabled', 'Looks disabled', 'looks disabled|disabled|inactive|unavailable|greyed button', '+opacity-50 +pointer-events-none +cursor-not-allowed'),
  R('clickable', 'Feels clickable', 'feels clickable|clickable|interactive|tappable|looks clickable', '+cursor-pointer +transition +hover:shadow-sm'),
  R('invert', 'Invert colors', 'invert colors|invert|flip colors|swap colors|reverse colors', 'shade:bg=900|bg-slate-900 shade:text=50|text-slate-50'),
  R('breathing', 'Breathing room', 'breathing room|room to breathe|more room|roomy|give room|space around|more padding room|padding room|needs air|let it breathe|breathe', 'Padding+1|p-6'),
  R('room-around', 'Room around it', 'room around it|space around it|margin room|more margin|space outside', 'Margin+1|m-6'),
  R('room-above', 'Room above', 'room above|space above|more space above', 'Margin+1|mt-6'),
  R('room-below', 'Room below', 'room below|space below|more space below', 'Margin+1|mb-6'),
  R('gap-up', 'More space between', 'space between|more space between|space out|spread out|space them out|more gap|space between these', 'Gap+1|gap-6'),
  R('gap-down', 'Tighter spacing', 'tighter spacing|closer together|bring together|squish together|less space between|tight spacing', 'Gap-1|gap-2'),
  R('compact', 'More compact', 'compact|more compact|compress|squeeze|tighten up|tighten it up|condensed|shrink spacing', 'Padding-1|p-2 Gap-1|gap-2'),
  R('readable', 'Easier to read', 'easier to read|reading friendly|readable layout|comfortable reading|reading width', '+leading-relaxed b:+max-w-prose'),
  R('lines-up', 'Lines breathe', 'lines breathe|loosen the lines|more line spacing|line spacing|looser lines|leading up|space the lines', 'Line_height+1|leading-relaxed'),
  R('lines-down', 'Tighten the lines', 'tighten the lines|tighter lines|less line spacing|leading down', 'Line_height-1|leading-snug'),
  R('tracking-up', 'Letters breathe', 'letters breathe|more tracking|letter spacing|space the letters|looser letters|tracking up', 'Letter_spacing+1|tracking-wide'),
  R('tracking-down', 'Tighten tracking', 'tighten tracking|tighter letters|less tracking|tracking down|letters closer', 'Letter_spacing-1|tracking-tight'),
  R('narrower', 'Reading width', 'reading width|narrow column|column width|measure|narrow measure', 'Width-1|max-w-prose', { block: true }),
  R('softer-corners', 'Softer corners', 'softer corners|soften corners|soften the edges|soften edges|round the corners|round corners|smooth corners|rounder corners', 'Border_radius+1|rounded-xl'),
  R('sharper-corners', 'Sharper corners', 'sharper corners|sharpen corners|squarer corners|square corners|harder edges|sharp corners', 'Border_radius-1|rounded-sm'),
  R('pill', 'Pill shaped', 'pill shaped|pill shape|pill|capsule|fully rounded|round ends', '+rounded-full', { block: '+rounded-3xl' }),
  R('frame', 'Subtle edge', 'subtle edge|frame it|frame|outline it|edge|add a border|border it|add border|bordered|with a border', '+border +border-slate-200'),
  R('stronger-border', 'Stronger border', 'stronger border|thicker border|bolder border|heavier border|more visible border', '+border-2 +border-slate-300'),
  R('no-border', 'No border', 'no border|borderless|without border|without a border|remove the border|remove border|drop the border', '~Border_width ~Border_color'),
  R('dashed', 'Dashed border', 'dashed|dashed border|dashes', '+border +border-dashed'),
  R('dotted', 'Dotted border', 'dotted|dotted border|dots border', '+border +border-dotted'),
  R('accent', 'Left accent', 'left accent|accent|accent bar|side bar|side accent|accent border|callout bar', '+border-l-4 +border-indigo-500 +pl-4'),
  R('all-caps', 'All caps', 'all caps|shout|shouting|caps|loud text|capital letters|capitals|screaming', '+uppercase +tracking-wide'),
  R('less-shouty', 'Less shouty', 'less shouty|calmer caps|not shouty', '-uppercase Font_weight-1 Font_size-1'),
  R('less-cramped', 'Less cramped', 'less cramped|uncramped', 'Padding+1|p-4 Line_height+1|leading-relaxed'),
  R('less-busy', 'Less busy', 'less busy|uncluttered look|less cluttered', '~Shadow ~Ring -uppercase -italic'),
  R('less-heavy', 'Less heavy', 'less heavy|lighter feel|less chunky', 'Font_weight-1 Shadow-1 Border_width-1'),
  R('less-harsh', 'Less harsh', 'less harsh|less stark|less glaring', 'shade:text~700|text-slate-700 Shadow-1 Border_radius+1|rounded-md'),
  R('less-plain', 'Less plain', 'less plain|less bland|less boring', '+rounded-lg +shadow-sm +border +border-slate-200'),
  R('title-case', 'Title case', 'title case|capitalize|capitalise|capitalized', '+capitalize'),
  R('normal-case', 'Normal case', 'normal case|no caps|lowercase it', '+normal-case'),
  R('balance', 'Balanced wrapping', 'balance the heading|balanced|balance text|balance the text', '+text-balance'),
  R('pretty-wrap', 'Nicer wrapping', 'nicer wrapping|pretty wrap|better wrapping|avoid orphans|orphans', '+text-pretty'),
  R('one-line', 'One line', 'one line|single line|no wrap|nowrap|keep on one line', '+whitespace-nowrap'),
  R('ellipsis', 'Ellipsis', 'ellipsis|truncate|cut off with dots|cut off', '+truncate'),
  R('two-lines', 'Two lines max', 'two lines max|two lines|clamp to two lines|clamp two lines|line clamp', '+line-clamp-2'),
  R('wavy', 'Wavy underline', 'wavy underline|squiggly|squiggle|squiggly underline|wavy', '+underline +decoration-wavy +decoration-indigo-500 +underline-offset-4'),
  R('underline-nice', 'Underline', 'nice underline|offset underline|underlined nicely', '+underline +underline-offset-4'),
  R('bg-calmer', 'Calmer background', 'background calmer|calm background|quiet background', '+bg-slate-50'),
  R('bg-warmer', 'Warmer background', 'background warmer|warm background', '+bg-amber-50'),
  R('bg-cooler', 'Cooler background', 'background cooler|cool background', '+bg-blue-50'),
  R('border-quieter', 'Quieter border', 'border quieter|quiet border|softer border|subtle border', '+border-slate-200'),
  R('border-visible', 'More visible border', 'border more visible|visible border|clearer border', '+border-slate-300'),
];

// ---------- Layout ----------

const LAYOUT = [
  R('row', 'Side by side', 'side by side|row|in a row|horizontal|next to each other|inline them|beside each other|row layout|horizontally|sideways', '+flex +flex-row +gap-4', { layout: true }),
  R('stack', 'Stack', 'stack|stacked|stack these|vertical|vertically|one under another|on top of each other|column|column layout|top to bottom|stack them', '+flex +flex-col +gap-4', { layout: true }),
  R('center-contents', 'Center the contents', 'center the contents|center contents|center everything|center inside|centre the contents|center items|dead center|center both ways', '+flex +items-center +justify-center', { layout: true }),
  R('two-col', 'Two columns', 'two column|two columns|2 columns|2 column|two column layout|two cols', '+grid +grid-cols-2 +gap-6', { layout: true }),
  R('three-col', 'Three columns', 'three column|three columns|3 columns|3 column|three column layout|three cols', '+grid +grid-cols-3 +gap-6', { layout: true }),
  R('wrap', 'Wrap', 'wrap|wrap around|let it wrap|flow and wrap|wrapping row', '+flex +flex-wrap +gap-4', { layout: true }),
];

// ---------- Archetypes ----------

const ARCH = [
  R('card', 'Card', 'card|a card|panel card|box card|tile', '+bg-white +border +border-slate-200 +rounded-xl +shadow-sm +p-6', { arch: true }),
  R('pricing-card', 'Pricing card', 'pricing card|pricing tier|price card|plan card|pricing plan|pricing box|pricing', '+bg-white +border +border-slate-200 +rounded-xl +shadow-md +p-6 +text-center +ring-1 +ring-slate-900/5', {
    arch: true,
    alts: [
      ALT('Featured', '+bg-slate-900 +text-white +border-slate-800 +rounded-xl +shadow-xl +p-6 +text-center'),
      ALT('Outline', '+border-2 +border-indigo-500 +bg-white +rounded-xl +p-6 +text-center'),
    ],
  }),
  R('callout', 'Callout', 'callout|info banner|info box|note box|notice|info callout|tip box|information box|infobox', '+bg-sky-50 +border +border-sky-200 +text-sky-900 +rounded-lg +p-4', {
    arch: true, alts: [ALT('With a bar', '+border-l-4 +border-sky-500 +bg-sky-50 +pl-4 +py-3 +text-sky-900')],
  }),
  R('warning', 'Warning banner', 'warning banner|warning|warning box|caution|alert box|warning callout|heads up|warn', '+bg-amber-50 +border +border-amber-200 +text-amber-900 +rounded-lg +p-4 +font-medium', { arch: true }),
  R('error', 'Error banner', 'error banner|error|error message|error box|danger|danger box|failure message|problem banner', '+bg-red-50 +border +border-red-200 +text-red-800 +rounded-lg +p-4', { arch: true, alts: [ALT('Solid', '+bg-red-600 +text-white +rounded-lg +p-4')] }),
  R('success', 'Success message', 'success message|success banner|success|success box|confirmation|done message|all good', '+bg-emerald-50 +border +border-emerald-200 +text-emerald-800 +rounded-lg +p-4', { arch: true }),
  R('quote', 'Quote', 'quote|blockquote|block quote|pull quote look|quotation|testimonial|citation', '+border-l-4 +border-slate-300 +pl-6 +italic +text-slate-700 +text-lg +leading-relaxed', {
    arch: true, alts: [ALT('Pull quote', '+text-2xl +font-serif +text-center +text-slate-800 +my-8')],
  }),
  R('badge', 'Badge', 'badge|tag|label badge|status badge|tag badge|lozenge', '+inline-flex +items-center +rounded-full +bg-indigo-100 +text-indigo-800 +px-2.5 +py-0.5 +text-xs +font-medium', { arch: true }),
  R('pill-shape', 'Pill', 'pill badge|pill label', '+rounded-full +px-3 +py-1', { arch: true }),
  R('chip', 'Chip', 'chip|chips', '+inline-flex +rounded-full +bg-slate-100 +px-2 +py-1 +text-sm', { arch: true }),
  R('button', 'Button', 'button|a button|buttonish|cta|call to action|action button|primary button', '+inline-flex +items-center +rounded-md +bg-indigo-600 +text-white +px-4 +py-2 +text-sm +font-semibold +shadow-sm +hover:bg-indigo-700 +cursor-pointer +select-none', { arch: true }),
  R('secondary-button', 'Secondary button', 'secondary button|outline button|ghost button|second button|alt button', '+inline-flex +items-center +rounded-md +border +border-slate-300 +bg-white +text-slate-900 +px-4 +py-2 +text-sm +font-semibold +hover:bg-slate-50', { arch: true }),
  R('link', 'Link', 'link|a link|hyperlink|link look|looks like a link', '+text-blue-600 +underline +underline-offset-2', { arch: true }),
  R('hero', 'Hero', 'hero|hero title|hero heading|banner heading|big headline|splash|headline', '+text-5xl +font-bold +tracking-tight +text-slate-900 +text-center +py-16', {
    arch: true, alts: [ALT('Dark', '+bg-slate-900 +text-white +rounded-2xl +p-12 +text-center')],
  }),
  R('page-title', 'Page title', 'page title|title|main title|main heading|h1 look', '+text-4xl +font-bold +tracking-tight +text-slate-900', { arch: true }),
  R('section-heading', 'Section heading', 'section heading|section title|h2 look|heading', '+text-2xl +font-bold +tracking-tight +text-slate-900', { arch: true }),
  R('subheading', 'Subheading', 'subheading|subtitle|sub heading|subhead|h3 look', '+text-xl +font-semibold +text-slate-800 +mt-8 +mb-2', { arch: true }),
  R('caption', 'Caption', 'caption|image caption|small caption|figure caption', '+text-sm +text-slate-500 +leading-snug', { arch: true }),
  R('footnote', 'Fine print', 'footnote|fine print|small print|disclaimer|legal text', '+text-xs +leading-relaxed +text-slate-500', { arch: true }),
  R('lead', 'Lead paragraph', 'lead|lead paragraph|intro paragraph|intro|introduction|standfirst|lede|opening paragraph', '+text-xl +text-slate-600 +leading-relaxed', { arch: true }),
  R('kicker', 'Kicker', 'kicker|eyebrow|overline|section label|small label above', '+text-xs +font-semibold +uppercase +tracking-widest +text-indigo-600', { arch: true }),
  R('code-block', 'Code block', 'code block|code box|snippet|code snippet|pre block|source code', '+font-mono +text-sm +bg-zinc-950 +text-zinc-100 +rounded-lg +p-4 +overflow-x-auto', { arch: true }),
  R('inline-code', 'Inline code', 'inline code|code|code span|monospace snippet|code word', '+font-mono +text-sm +bg-slate-100 +rounded-sm +px-1', { arch: true }),
  R('kbd', 'Keyboard key', 'keyboard key|key cap|keycap|kbd|shortcut key|key', '+font-mono +text-xs +bg-slate-100 +text-slate-800 +border +border-slate-300 +rounded-sm +px-1.5 +py-0.5', { arch: true }),
  R('divider', 'Divider', 'divider|separator|rule|horizontal rule|hr|divider line|line between', '+border-t +border-slate-200 +my-8', { arch: true }),
  R('stat', 'Big number', 'stat|big number|metric|statistic|kpi|figure|number highlight|big stat', '+text-5xl +font-bold +tabular-nums +tracking-tight +text-slate-900 +leading-none', { arch: true }),
  R('toast', 'Toast', 'toast|snackbar|notification|popup message|flash message', '+bg-slate-900 +text-white +rounded-lg +shadow-lg +px-4 +py-3 +text-sm', { arch: true }),
  R('floating-panel', 'Floating panel', 'floating panel|popover|dropdown|floating card|menu panel|modal|dialog', '+bg-white +rounded-xl +shadow-lg +border +border-slate-200 +p-5', { arch: true }),
  R('media-card', 'Media card', 'media card|image card|photo card|picture card|thumbnail card', '+overflow-hidden +rounded-xl +border +border-slate-200 +shadow-sm', { arch: true }),
  R('label', 'Form label', 'form label|field label|input label|label text', '+text-sm +font-medium +text-slate-700', { arch: true }),
  R('avatar', 'Avatar', 'avatar|profile picture|profile photo|user picture|headshot', '+size-10 +rounded-full +object-cover', { arch: true }),
  R('highlight', 'Highlight', 'highlight|highlighter|marker|mark|highlighted|marked text', '+bg-yellow-100 +px-1 +rounded-sm', { arch: true }),
];

export const RECIPES = [...MOODS, ...LAYOUT, ...ARCH];
export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

/** The 22 router ids Gemini Nano may answer with, mapped to the recipe each one runs. */
export const ROUTER_RECIPE = {
  mood_calm: 'calm', mood_elegant: 'elegant', mood_premium: 'premium', mood_playful: 'friendlier', mood_minimal: 'minimal',
  mood_loud: 'pop', mood_warm: 'warm', mood_cool: 'cool', mood_dark: 'dark', mood_editorial: 'editorial', mood_techy: 'techy',
  arch_card: 'card', arch_callout: 'callout', arch_warning: 'warning', arch_quote: 'quote', arch_badge: 'badge',
  arch_button: 'button', arch_hero: 'hero', depth_up: 'lift', depth_down: 'flat', space_up: 'breathing', space_down: 'compact',
};

// Phrase index: every word list maps to its recipe; the longest key wins at match time.
const INDEX = new Map();
for (const r of RECIPES) for (const w of r.words) if (!INDEX.has(w)) INDEX.set(w, r);
const MAX_WORDS = Math.max(...[...INDEX.keys()].map((k) => k.split(' ').length));

const LEAD_MORE = new Set(['more', 'really', 'very', 'so', 'super', 'extra']);

/** All the phrases the recipes answer to (for the offline embedding index and tests). */
export function recipePhrases() {
  const out = [];
  for (const r of RECIPES) for (const w of r.words) out.push({ phrase: w, id: r.id });
  return out;
}

/**
 * The recipe for a phrase (already lowercased, filler and intensity words
 * removed), or null. "more calm" is "calm". A phrase made only of recipe
 * words ("dark pricing card", "calm elegant") gives a list: archetypes first.
 * -> { recipes: [recipe...], exact: boolean } | null
 */
export function matchRecipes(words) {
  if (!words.length) return null;
  let w = words;
  while (w.length > 1 && LEAD_MORE.has(w[0]) && !INDEX.has(w.join(' '))) w = w.slice(1);
  const whole = INDEX.get(w.join(' '));
  if (whole) return { recipes: [whole], exact: true };
  // Greedy longest-first segmentation; every word must be consumed.
  const found = [];
  let i = 0;
  while (i < w.length) {
    let hit = null;
    for (let n = Math.min(MAX_WORDS, w.length - i); n >= 1; n--) {
      const r = INDEX.get(w.slice(i, i + n).join(' '));
      if (r) { hit = { r, n }; break; }
    }
    if (!hit) return null;
    found.push(hit.r);
    i += hit.n;
  }
  if (found.length < 2 || found.length > 3) return null;
  const uniq = [...new Set(found)];
  uniq.sort((a, b) => Number(Boolean(b.arch)) - Number(Boolean(a.arch)));
  return { recipes: uniq, exact: false };
}

// ---------- Resolution ----------

const COLOR_PROPS = { text: 'text-', bg: 'bg-', border: 'border-', ring: 'ring-' };
const FAMILY_SET = new Set(FAMILIES);
const WARM = { slate: 'stone', gray: 'stone', zinc: 'stone', neutral: 'stone', blue: 'amber', sky: 'amber', indigo: 'orange', cyan: 'amber', teal: 'amber' };
const COOL = { stone: 'slate', neutral: 'slate', amber: 'sky', orange: 'sky', yellow: 'sky' };
const label = (base) => (lookup(base) || {}).label || '';

function sameScope(token, prefix) {
  return normalizePrefix(splitTokenSimple(token).prefix) === normalizePrefix(prefix);
}

function colorParts(token, pfx) {
  const { base } = splitTokenSimple(token);
  if (!base.startsWith(pfx)) return null;
  const m = /^([a-z]+)-(\d+)(\/.+)?$/.exec(base.slice(pfx.length));
  if (!m || !FAMILY_SET.has(m[1])) return null;
  return { family: m[1], shade: m[2], alpha: m[3] || '' };
}

function stepLabel(list, ctx, lab, n, seed) {
  const hits = list.filter((t) => sameScope(t, ctx.prefix) && label(splitTokenSimple(t).base) === lab);
  if (hits.length) {
    let out = list;
    for (const h of hits) {
      let to = null;
      for (let k = Math.abs(n); k >= 1 && !to; k--) to = scrubClass(h, k * Math.sign(n));
      if (to) out = out.map((t) => (t === h ? to : t));
    }
    return out;
  }
  if (!seed) return list;
  let t = `${ctx.prefix}${seed}`;
  if (Math.abs(n) > 1) {
    for (let k = Math.abs(n) - 1; k >= 1; k--) {
      const s = scrubClass(t, k * Math.sign(n));
      if (s) { t = s; break; }
    }
  }
  return addClass(list, t);
}

function shadeOp(list, ctx, spec) {
  const m = /^(text|bg|border|ring)([+\-=~])(\d+)(?:\|(.+))?$/.exec(spec);
  if (!m) return list;
  const [, prop, mode, num, seed] = m;
  const pfx = COLOR_PROPS[prop];
  const hits = list.filter((t) => sameScope(t, ctx.prefix) && colorParts(t, pfx));
  if (!hits.length) return seed ? addClass(list, `${ctx.prefix}${seed}`) : list;
  let out = list;
  for (const h of hits) {
    const c = colorParts(h, pfx);
    const at = SHADES.indexOf(c.shade);
    if (at < 0) continue;
    let to;
    if (mode === '=') to = SHADES.indexOf(num);
    else if (mode === '~') {
      const goal = SHADES.indexOf(num);
      const step = Math.max(1, ctx.mult);
      to = goal > at ? Math.min(goal, at + step) : Math.max(goal, at - step);
    } else to = at + (mode === '+' ? 1 : -1) * Number(num) * Math.max(1, ctx.mult);
    to = Math.max(0, Math.min(SHADES.length - 1, to));
    if (to === at) continue;
    const next = `${splitTokenSimple(h).prefix}${pfx}${c.family}-${SHADES[to]}${c.alpha}`;
    out = out.map((t) => (t === h ? next : t));
  }
  return out;
}

function famOp(list, ctx, dir) {
  const map = dir === 'warm' ? WARM : COOL;
  let out = list;
  for (const pfx of Object.values(COLOR_PROPS)) {
    for (const t of out) {
      if (!sameScope(t, ctx.prefix)) continue;
      const c = colorParts(t, pfx);
      if (!c || !map[c.family]) continue;
      const next = `${splitTokenSimple(t).prefix}${pfx}${map[c.family]}-${c.shade}${c.alpha}`;
      out = out.map((x) => (x === t ? next : x));
    }
  }
  return out;
}

/** Prefix a recipe class with the scope, unless the class already carries that scope itself (hover: under hover). */
function scoped(prefix, cls) {
  return prefix && cls.startsWith(prefix) ? cls : `${prefix}${cls}`;
}

function runOp(list, ctx, op) {
  let o = op;
  if (o.startsWith('b:')) { if (ctx.inline) return list; o = o.slice(2); }
  else if (o.startsWith('i:')) { if (!ctx.inline) return list; o = o.slice(2); }
  const head = o[0];
  if (head === '+') return addClass(list, scoped(ctx.prefix, o.slice(1)));
  if (head === '-' && !/^-?[A-Z]/.test(o)) {
    const cls = o.slice(1);
    return list.filter((t) => !(sameScope(t, ctx.prefix) && splitTokenSimple(t).base === cls));
  }
  if (head === '?') {
    const cls = o.slice(1);
    const g = groupOf(cls);
    const taken = g && list.some((t) => sameScope(t, ctx.prefix) && groupOf(splitTokenSimple(t).base) === g);
    return taken ? list : addClass(list, `${ctx.prefix}${cls}`);
  }
  if (head === '~') {
    const lab = o.slice(1).replace(/_/g, ' ');
    return list.filter((t) => !(sameScope(t, ctx.prefix) && label(splitTokenSimple(t).base) === lab));
  }
  if (o.startsWith('shade:')) return shadeOp(list, ctx, o.slice(6));
  if (o === 'fam:warm') return famOp(list, ctx, 'warm');
  if (o === 'fam:cool') return famOp(list, ctx, 'cool');
  const m = /^([A-Z][A-Za-z_]*)([+-])(\d+)(?:\|(.+))?$/.exec(o);
  if (m) {
    const n = Number(m[3]) * (m[2] === '-' ? -1 : 1) * Math.max(1, ctx.mult);
    return stepLabel(list, ctx, m[1].replace(/_/g, ' '), n, m[4]);
  }
  return list;
}

function runOps(list, ctx, recipeOrAlt, flags) {
  let ops = recipeOrAlt.ops.split(/\s+/).filter(Boolean);
  if (flags.lite && ctx.level <= 1) ops = ops.slice(0, 2);
  let cur = list;
  for (const op of ops) {
    const next = runOp(cur, ctx, op);
    const changed = next.join(' ') !== cur.join(' ');
    cur = next;
    if (flags.chain && changed && ctx.level < 2) break;
  }
  return cur;
}

const BIG = new Set(['hidden', 'sr-only', 'invisible', 'opacity-0', 'absolute', 'fixed', 'w-screen', 'h-screen']);

/**
 * Runs recipes (one, or several for a compound phrase) against the target.
 * ctx: { classes, prefix, level, hedged, kind ('inline' | 'block' | ...) }
 * alt: index into recipes[0].alts, or -1 for the main version.
 * -> { tokens (new or changed, in order), removed (gone or replaced), final, title } or null when nothing changes.
 */
export function resolveRecipes(recipes, ctx, alt = -1) {
  const c = { ...ctx, prefix: ctx.prefix || '', mult: ctx.level || 1, inline: ctx.kind === 'inline', level: ctx.level || 0 };
  const before = [...(ctx.classes || [])];
  let list = before;
  recipes.forEach((r, i) => {
    const src = i === 0 && alt >= 0 && r.alts && r.alts[alt] ? r.alts[alt] : r;
    list = runOps(list, c, src, { lite: r.lite, chain: r.chain });
    if (r.fallback && list.join(' ') === before.join(' ')) list = runOps(list, c, { ops: r.fallback }, {});
    if (r.block && typeof r.block === 'string' && !c.inline) list = runOps(list, c, { ops: r.block }, {});
  });
  list = completePairs(list);
  const final = list.filter((t) => before.includes(t) || !BIG.has(splitTokenSimple(t).base));
  const tokens = final.filter((t) => !before.includes(t));
  const removed = before.filter((t) => !final.includes(t));
  if (!tokens.length && !removed.length) return null;
  const first = recipes[0];
  const title = recipes.length > 1 ? recipes.map((r) => r.title).join(' + ') : alt >= 0 && first.alts && first.alts[alt] ? `${first.title}: ${first.alts[alt].title}` : first.title;
  return { tokens, removed, final, title };
}

/** "font-bold -> font-medium, +shadow-md": the class change in catalog terms. */
export function describeDelta(tokens, removed) {
  const gone = [...removed];
  const parts = [];
  for (const t of tokens) {
    const g = groupOf(splitTokenSimple(t).base);
    const at = gone.findIndex((r) => g && sameScope(r, splitTokenSimple(t).prefix) && groupOf(splitTokenSimple(r).base) === g);
    if (at >= 0) parts.push(`${gone.splice(at, 1)[0]} -> ${t}`);
    else parts.push(`+${t}`);
  }
  for (const r of gone) parts.push(`-${r}`);
  return parts.join(', ');
}

/** Every class a recipe can add, for the catalog test. */
export function recipeClasses() {
  const out = new Set();
  const grab = (ops) => {
    for (const raw of ops.split(/\s+/).filter(Boolean)) {
      let o = raw.replace(/^[bi]:/, '');
      if ('+-?'.includes(o[0]) && !/^-?[A-Z]/.test(o)) out.add(o.slice(1));
      const seed = /\|([a-z0-9./\[\]#-]+)$/.exec(o);
      if (seed) out.add(seed[1]);
    }
  };
  for (const r of RECIPES) {
    grab(r.ops);
    if (typeof r.block === 'string') grab(r.block);
    if (r.fallback) grab(r.fallback);
    for (const a of r.alts || []) grab(a.ops);
  }
  return [...out];
}
