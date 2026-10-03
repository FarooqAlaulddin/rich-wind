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
- `dev` moves to `main` through a pull request only; `main` requires the CI checks to pass.

## Releasing

1. Set the version in a pull request to `dev`: `npm version 1.0.0-rc.1 --no-git-tag-version`.
2. Merge `dev` into `main`.
3. Run the "Release to npm" workflow on `main` with the same version and a dist-tag. It
   tests, publishes, and creates the `v<version>` tag and GitHub release on that commit.

## Guidelines

- Keep core simple: no web framework runtime dependency, and no rate limiting or
  auth in core (the host decides who may call it and how often).
- Every code change ships with its tests.
- Keep docs minimal and update them when the API changes.
