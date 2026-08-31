# Security Policy

## Supported Versions

Sci2Code is under active development. Security fixes are applied to the latest release on `main`; older tags are not separately maintained.

| Version         | Supported          |
| --------------- | ------------------- |
| Latest (`main`) | :white_check_mark:  |
| Older releases  | :x:                  |

## Reporting a Vulnerability

**Do not open a public GitHub Issue for security vulnerabilities.**

Report security issues privately using one of the following channels:

- [GitHub Security Advisories](https://github.com/The-Self-Research-Institute/Sci2Code-extension-for-vscode/security/advisories/new) for this repository (preferred) — this creates a private discussion visible only to you and the maintainers until a fix is ready, or
- Email [support@selfresearch.org](mailto:support@selfresearch.org)

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof-of-concept
- Affected area (e.g. authentication/`src/auth`, Zotero API integration/`src/api`, citation features/`src/features`)
- Any known mitigations

## What to Expect

- We will acknowledge your report as soon as possible after triage.
- We will investigate and keep you updated on progress toward a fix.
- Once a fix is available, we will coordinate disclosure timing with you and credit reporters who wish to be credited.
- If a report is declined (e.g. out of scope, not reproducible), we will explain why.

## Scope

This policy covers the Sci2Code VS Code extension in this repository. Vulnerabilities in third-party dependencies (including Zotero itself) should generally be reported upstream, but please also let us know so we can track and update accordingly.
