// Sample content for the "Try an example" menu. Each example is a Lexical
// editor state built from the demo's styled nodes. Some include classes that
// Tailwind does not know, so the compiler's rejected[] feedback is visible.

function textNode(text) {
  return { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '' };
}

function spanNode(text, classes) {
  return { type: 'tailwind-span', text, tailwindClasses: classes, format: 0, detail: 0, mode: 'normal', style: '' };
}

function heading(tag, classes, children) {
  return { type: 'styled-heading', tag, tailwindClasses: classes, children, direction: 'ltr', format: '', indent: 0, version: 1 };
}

function para(classes, children) {
  return { type: 'styled-paragraph', tailwindClasses: classes, children, direction: 'ltr', format: '', indent: 0, version: 1 };
}

function editorState(children) {
  return { root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } };
}

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
];
