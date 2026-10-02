// Sample content for the "Try an example" menu. Each example is a Lexical
// editor state built from the demo's styled nodes (see blocks.js). Some include classes that
// Tailwind does not know, so the compiler's rejected[] feedback is visible.

import { textNode, spanNode, heading, para, box, editorState, metric, CARD } from './blocks';

const DARK = '[.theme-dark_&]:';

export const EXAMPLES = [
  {
    id: 'pricing',
    label: 'AI pricing card',
    hint: 'Model output with two made-up classes',
    hasRejected: true,
    state: editorState([
      heading('h2', 'text-2xl font-bold tracking-tight text-slate-900 [.theme-dark_&]:text-white', [textNode('Pro plan')]),
      para('text-5xl font-extrabold text-indigo-600 [.theme-dark_&]:text-indigo-400 tracking-tighter', [
        textNode('$24'),
        spanNode('/month', 'text-base font-medium text-slate-500 tracking-normal'),
      ]),
      para('rounded-2xl border border-slate-200 bg-white p-5 shadow-md text-slate-700 [.theme-dark_&]:bg-slate-800 [.theme-dark_&]:border-slate-700 [.theme-dark_&]:text-slate-200', [
        textNode('Unlimited pages, shared bundles, and '),
        spanNode('auto-promoted utilities', 'font-semibold text-brand-500'),
        textNode(' across your whole project.'),
      ]),
      para('mt-2 rounded-xxl bg-indigo-600 px-5 py-3 text-center font-semibold text-white shadow-lg hover:bg-indigo-700', [
        textNode('Start free trial'),
      ]),
    ]),
  },
  {
    id: 'hero',
    label: 'Landing hero',
    hint: 'Gradient text, spacing, responsive sizes',
    hasRejected: false,
    state: editorState([
      para('text-xs font-semibold uppercase tracking-widest text-emerald-600 [.theme-dark_&]:text-emerald-400', [textNode('Now in alpha')]),
      heading('h1', 'text-4xl md:text-5xl font-extrabold leading-tight tracking-tight bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent', [
        textNode('Tailwind at runtime, no build step'),
      ]),
      para('max-w-xl text-lg leading-relaxed text-slate-600 [.theme-dark_&]:text-slate-300', [
        textNode('Send class names or HTML to the core, get compiled CSS back in milliseconds. '),
        spanNode('Every class in this hero', 'rounded bg-amber-100 px-1 text-amber-900 [.theme-dark_&]:bg-amber-900 [.theme-dark_&]:text-amber-100'),
        textNode(' was compiled while you were reading it.'),
      ]),
    ]),
  },
  {
    id: 'alert',
    label: 'Alert with typos',
    hint: 'Three invalid classes to fix',
    hasRejected: true,
    state: editorState([
      para('flex gap-3 rounded-lg border-l-4 border-rose-500 bg-rose-50 p-4 text-rose-900 [.theme-dark_&]:bg-rose-950 [.theme-dark_&]:text-rose-100', [
        spanNode('Payment failed.', 'font-bold'),
        textNode(' Your card was declined. Update your billing details to keep the project running.'),
      ]),
      para('text-sm text-slate-500 italic [.theme-dark_&]:text-slate-400', [
        textNode('The block above also asked for '),
        spanNode('text-danger', 'font-mono text-danger'),
        textNode(', '),
        spanNode('p-huge', 'font-mono p-huge'),
        textNode(' and '),
        spanNode('shadow-glow', 'font-mono shadow-glow'),
        textNode('. None exist in Tailwind, so the compiler reports them instead of guessing.'),
      ]),
    ]),
  },
  {
    id: 'metrics',
    label: 'Metrics dashboard',
    hint: 'Containers: a grid of cards, number over label',
    hasRejected: false,
    state: editorState([
      heading('h2', `text-2xl font-bold tracking-tight text-slate-900 ${DARK}text-white`, [textNode('This week')]),
      box('mt-4 grid grid-cols-2 gap-4 md:grid-cols-4', [
        metric('12.4k', 'Visitors', [spanNode(' +12%', 'ml-1 text-sm font-semibold text-emerald-600')]),
        metric('3.2%', 'Conversion', [spanNode(' -0.4%', 'ml-1 text-sm font-semibold text-rose-600')]),
        metric('$8,140', 'Revenue'),
        metric('214', 'Orders'),
      ]),
      para(`mt-4 text-sm text-slate-500 ${DARK}text-slate-400`, [textNode('Each card is a container. Click its border to style the card, or its text to style the number.')]),
    ]),
  },
  {
    id: 'features',
    label: 'Feature grid',
    hint: 'Three columns of cards with headings',
    hasRejected: false,
    state: editorState([
      heading('h2', `text-center text-3xl font-extrabold tracking-tight text-slate-900 ${DARK}text-white`, [textNode('Why runtime styling')]),
      box('mt-6 grid grid-cols-1 gap-5 md:grid-cols-3', [
        ['No build step', 'Markup written after deploy is styled the moment it arrives.', 'bg-sky-100 text-sky-700'],
        ['Shared bundles', 'Classes many pages use move to one cached stylesheet.', 'bg-violet-100 text-violet-700'],
        ['Honest feedback', 'Unknown classes come back in rejected[] instead of failing silently.', 'bg-amber-100 text-amber-800'],
      ].map(([title, text, badge]) => box(CARD, [
        para(`w-fit rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge}`, [textNode('Feature')]),
        heading('h3', `mt-3 text-lg font-semibold text-slate-900 ${DARK}text-white`, [textNode(title)]),
        para(`mt-1 text-slate-600 ${DARK}text-slate-300`, [textNode(text)]),
      ]))),
    ]),
  },
  {
    id: 'tiers',
    label: 'Pricing tiers',
    hint: 'Three plans, the middle one highlighted',
    hasRejected: false,
    state: editorState([
      box('grid grid-cols-1 gap-5 md:grid-cols-3', [
        ['Hobby', '$0', 'One project, community support', false],
        ['Team', '$24', 'Unlimited pages and shared bundles', true],
        ['Scale', '$99', 'Replicas, cache store and priority support', false],
      ].map(([name, price, text, best]) => box(`${CARD} flex flex-col gap-2 ${best ? 'ring-2 ring-indigo-500' : ''}`.trim(), [
        para(`text-sm font-semibold uppercase tracking-wider ${best ? 'text-indigo-600' : 'text-slate-500'}`, [textNode(name)]),
        para(`text-4xl font-extrabold text-slate-900 ${DARK}text-white`, [textNode(price), spanNode('/mo', 'text-base font-medium text-slate-500')]),
        para(`text-slate-600 ${DARK}text-slate-300`, [textNode(text)]),
        para(`mt-2 rounded-lg px-4 py-2 text-center font-semibold ${best ? 'bg-indigo-600 text-white' : `bg-slate-100 text-slate-900 ${DARK}bg-slate-700 ${DARK}text-white`}`, [textNode('Choose plan')]),
      ]))),
    ]),
  },
];
