# Security Policy

## Reporting a vulnerability

Report privately through GitHub: open the repository's Security tab and choose
"Report a vulnerability" (private security advisory):
https://github.com/FarooqAlaulddin/rich-wind/security/advisories/new

Do not open a public issue for a vulnerability.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | yes       |

## Scope

Rich Wind validates input, compiles CSS and protects its own resources. Rate
limiting and authentication are the host's responsibility; see the threat model
in [docs/runtime-spec.md](docs/runtime-spec.md#threat-model-and-enforcement-boundary).
