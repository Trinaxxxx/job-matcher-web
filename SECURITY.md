# Security Policy

## Reporting a Vulnerability

Please **do not** open a public issue for security problems.

Instead, report vulnerabilities privately through GitHub's Security Advisories:

👉 **[Report a vulnerability](https://github.com/Trinaxxxx/job-matcher-web/security/advisories/new)**

This keeps the details private until a fix is available.

### What to include

- A clear description of the issue and its potential impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version, commit, or URL
- Any suggested remediation

### What to expect

- **Acknowledgement:** within 3 business days
- **Initial assessment:** within 7 business days
- **Fix & disclosure:** coordinated with you once a patch is ready

## Supported Versions

This project is under active development. Security fixes are applied to the
latest `main` branch; there are no separately maintained release branches.

| Version | Supported |
| ------- | --------- |
| `main`  | ✅        |

## Scope

In scope: this repository's source code and its deployed instances.

Out of scope: vulnerabilities in third-party dependencies (please report those
upstream; our Dependabot alerts track known advisories), and findings that
require physical access or social engineering.

## Secrets & Credentials

Never include real credentials, API keys, or personal data in reports, issues,
or pull requests. Secret scanning with push protection is enabled on this
repository. If you believe a secret has been exposed, report it privately via
the advisory link above so it can be rotated.
