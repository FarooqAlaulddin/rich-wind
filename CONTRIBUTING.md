# Contributing

## Setup and checks

```bash
npm ci
npm test
npm run test:pack
npm run build:lexical-demo
```

## Branch flow

- Open pull requests against `dev`.
- `dev` moves to `main` through a pull request only.

## Guidelines

- Keep core simple: no web framework runtime dependency, and no rate limiting or
  auth in core (the host decides who may call it and how often).
- Every code change ships with its tests.
- Keep docs minimal and update them when the API changes.
