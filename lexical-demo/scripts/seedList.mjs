// Which classes stay in the main bundle (catalogSeed.js) so search and the
// shelf work before the full catalog chunk arrives: the shelf's own
// options (shelf/strips.js), every class an intent points at, shade 500 of each palette color,
// and the most popular classes.
import { INTENTS, PATTERN_INTENTS } from '../src/search/wordMap.js';
import { allStripClasses } from '../src/shelf/strips.js';
import { popularity } from '../src/searchPopularity.js';

const POPULARITY_CUTOFF = 76;
const FAMILIES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const SPACE = ['0', '1', '2', '3', '4', '6', '8', '10', '12', '16'];

function commonClasses() {
  const out = [];
  for (const f of ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'gap']) {
    for (const v of SPACE) out.push(`${f}-${v}`);
  }
  out.push('m-auto', 'mx-auto');
  for (const v of ['auto', 'full', 'screen', 'fit', '1/2', '1/3', '2/3', '1/4', '3/4', '16', '32', '64']) out.push(`w-${v}`);
  for (const v of ['auto', 'full', 'screen', 'fit', '8', '16', '32', '64']) out.push(`h-${v}`);
  for (const v of ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'prose', 'full']) out.push(`max-w-${v}`);
  out.push('block', 'flex', 'grid', 'hidden', 'flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse');
  for (const v of ['start', 'center', 'end', 'between', 'around', 'evenly']) out.push(`justify-${v}`);
  for (const v of ['start', 'center', 'end', 'stretch', 'baseline']) out.push(`items-${v}`);
  for (const v of ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']) out.push(`text-${v}`);
  for (const v of ['light', 'normal', 'medium', 'semibold', 'bold', 'extrabold']) out.push(`font-${v}`);
  for (const v of ['left', 'center', 'right', 'justify']) out.push(`text-${v}`);
  for (const v of ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose']) out.push(`leading-${v}`);
  for (const v of ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']) out.push(`tracking-${v}`);
  for (const s of ['', '-x', '-y', '-t', '-r', '-b', '-l']) for (const v of ['0', '', '-2', '-4', '-8']) out.push(`border${s}${v}`);
  for (const v of ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full']) out.push(`rounded-${v}`);
  for (const v of ['none', 'sm', 'md', 'lg', 'xl', '2xl']) out.push(`shadow-${v}`);
  for (const v of ['0', '10', '25', '50', '75', '90', '100']) out.push(`opacity-${v}`);
  for (const p of ['text', 'bg', 'border']) {
    for (const f of FAMILIES) out.push(`${p}-${f}-500`);
    out.push(`${p}-white`, `${p}-black`, `${p}-transparent`);
  }
  return out;
}

export async function seedClasses(rows, groups) {
  const want = new Set([...commonClasses(), ...allStripClasses()]);
  for (const it of INTENTS) for (const c of it.classes) want.add(c);
  for (const it of PATTERN_INTENTS) for (const c of it.classes) if (!c.includes('$')) want.add(c);
  for (const [cls, g] of rows) {
    if (cls.startsWith('-')) continue;
    const i = cls.lastIndexOf('-');
    const stem = i > 0 ? cls.slice(0, i) : cls;
    const val = i > 0 ? cls.slice(i + 1) : '';
    if (popularity(stem, val, groups[g][0], false) >= POPULARITY_CUTOFF) want.add(cls);
  }
  return want;
}
