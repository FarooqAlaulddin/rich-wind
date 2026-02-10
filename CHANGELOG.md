# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-09

### Added
- Initial public release of Rich Wind
- Stateless Tailwind CSS runtime service with in-memory caching
- `POST /api/compile` endpoint for compiling CSS from HTML and/or class lists
- `GET /api/css` endpoint for retrieving cached page CSS
- `GET /api/projects/:projectId/css` endpoint for aggregated project CSS
- `GET /health` endpoint for health checks
- Rate limiting with configurable limits
- LRU cache with TTL for project pages
- Express app export for library integration
- MIT License
- Comprehensive API documentation

### Fixed
- Error handler middleware now correctly placed after route definitions
- Rate bucket memory leak fixed with periodic cleanup
- Package.json properly configured for npm publishing

### Security
- Security headers (X-Content-Type-Options, Referrer-Policy, X-Frame-Options, CORS)
- Request size limits to prevent abuse
- Rate limiting to prevent API abuse
