---
slug: auto-promote-theme-css-docs
status: next
added: 2026-11-06
touched: 2026-11-06
pr: null
tags: [auto-promote, docs]
blocked_on: null
---

# Document that the promoted bundle needs the theme CSS

## Context

The promoted bundle is compiled with `bundle: 'utilities'` (`plugins/auto-promote/index.js`, refresh). Its rules reference theme variables such as `var(--color-red-500)` that it does not define. A page that loads its stripped CSS plus the bundle, but not the project's theme CSS, renders promoted classes unstyled. The Lexical demo loads the theme bundle (`lexical-demo/src/hooks/useMultiPageCompile.js`), but the docs never say so. Found by the Fable review on 2026-11-06.

## Done when

- [ ] One line in the Auto-Promote section of `docs/plugin-system.md` saying pages must also load the project theme CSS

## Links

- `docs/plugin-system.md` Auto-Promote section
