// Prompts and schemas for the local model (Gemini Nano). The router only ever
// returns one id from a closed list, so nothing the model writes becomes a class.

export const ROUTER_IDS = [
  'mood_calm', 'mood_elegant', 'mood_premium', 'mood_playful', 'mood_minimal', 'mood_loud',
  'mood_warm', 'mood_cool', 'mood_dark', 'mood_editorial', 'mood_techy',
  'arch_card', 'arch_callout', 'arch_warning', 'arch_quote', 'arch_badge', 'arch_button', 'arch_hero',
  'depth_up', 'depth_down', 'space_up', 'space_down',
];

export const ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent'],
  properties: { intent: { type: 'string', enum: [...ROUTER_IDS, 'none'] } },
};

const DESCRIBE = {
  mood_calm: 'calm, peaceful, relaxed, zen, soothing',
  mood_elegant: 'elegant, refined, classy, tasteful',
  mood_premium: 'premium, luxury, high-end, fancy, expensive-looking',
  mood_playful: 'playful, friendly, fun, cute, approachable',
  mood_minimal: 'minimal, clean, simple, stripped back',
  mood_loud: 'loud, bold, striking, make it pop, eye-catching',
  mood_warm: 'warm, cozy, sunny, inviting colors',
  mood_cool: 'cool, icy, fresh, calm blue colors',
  mood_dark: 'dark, moody, night, dark theme',
  mood_editorial: 'editorial, magazine, newspaper, serif reading',
  mood_techy: 'techy, futuristic, developer, hacker, sci-fi',
  arch_card: 'a card, pricing card, tile, panel',
  arch_callout: 'a callout, note, tip, info box, highlighted aside',
  arch_warning: 'a warning, alert, error banner, caution',
  arch_quote: 'a quote, pull quote, blockquote, testimonial',
  arch_badge: 'a badge, pill, tag, label, chip',
  arch_button: 'a button, call to action',
  arch_hero: 'a hero, headline section, banner, splash',
  depth_up: 'more depth, floating, raised, lift, shadowy',
  depth_down: 'flat, no depth, remove depth, flush',
  space_up: 'more room, airy, spacious, roomy, breathing space',
  space_down: 'tighter, compact, squeezed, dense, less space',
};

export const ROUTER_SYSTEM = [
  'You classify a styling request for one HTML element.',
  'Pick the one intent that best matches the request. Reply with the id only, as JSON.',
  'Use "none" when nothing fits.',
  '',
  ...ROUTER_IDS.map((id) => `${id}: ${DESCRIBE[id]}`),
].join('\n');

export const ROUTER_SHOTS = [
  { role: 'user', content: 'make it feel like a spa' },
  { role: 'assistant', content: '{"intent":"mood_calm"}' },
  { role: 'user', content: 'this should look dope and expensive' },
  { role: 'assistant', content: '{"intent":"mood_premium"}' },
  { role: 'user', content: 'cram it together' },
  { role: 'assistant', content: '{"intent":"space_down"}' },
  { role: 'user', content: 'what is the capital of France' },
  { role: 'assistant', content: '{"intent":"none"}' },
];

export function routerPrompt(query) {
  return `Request: ${String(query).slice(0, 160)}`;
}

// ---- Variations (behind a flag; see repair.js) ----

export const VARIATION_SYSTEM = [
  'You suggest short Tailwind class variations for one HTML element.',
  'Only use class names from the allowed list. Never invent classes.',
  'Reply as JSON: {"variations":[{"label":"...","add":[...],"remove":[...],"why":"..."}]}.',
].join('\n');

/** JSON schema whose class items are the dynamic allow-list (the decoder cannot invent). */
export function variationSchema(allowed, current) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['variations'],
    properties: {
      variations: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'add', 'remove'],
          properties: {
            label: { type: 'string', maxLength: 24 },
            add: { type: 'array', maxItems: 7, items: { type: 'string', enum: allowed.slice(0, 100) } },
            remove: { type: 'array', maxItems: 5, items: { type: 'string', enum: current.length ? current : ['none'] } },
            why: { type: 'string', maxLength: 90 },
          },
        },
      },
    },
  };
}

export function variationPrompt(query, current, allowed) {
  return `Request: ${String(query).slice(0, 160)}\nCurrent classes: ${current.join(' ') || '(none)'}\nAllowed: ${allowed.slice(0, 100).join(' ')}`;
}
