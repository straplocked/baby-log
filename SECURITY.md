# Security Policy

mybabynotes stores sensitive family data (feeding, sleep, health notes about real children), so security reports are taken seriously and handled with priority.

## Supported versions

| Version | Supported |
|---|---|
| Latest tagged release (`vX.Y.Z`) | ✅ |
| `main` (pre-release) | ✅ |
| Older tagged releases | ❌ — please upgrade |

Self-hosted instances update by pulling the latest images; there are no long-term support branches.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately via **GitHub's private vulnerability reporting**: go to this repository's **Security** tab → **Report a vulnerability**. That keeps the report visible only to you and the maintainer until a fix is released.

Include what you can of the following:

- A description of the issue and its impact
- Steps to reproduce (a proof of concept helps a lot)
- The version or commit you tested against
- Any suggested fix, if you have one

## What to expect

- **Acknowledgment** within a few days (this is a solo-maintained project — usually faster).
- An assessment of severity and impact, discussed with you in the advisory thread.
- A fix released as a new tagged version, with the advisory published after users have had a reasonable window to update.
- Credit in the advisory and release notes, if you'd like it.

## Scope notes

- The invite-only registration, token scopes (`/api/v1`), household data isolation, and the MCP server's auth are all in scope — cross-household data access of any kind is treated as critical.
- Vulnerabilities in dependencies are best reported upstream, but a heads-up here is welcome if mybabynotes' usage makes one exploitable.
- Testing must only be done against **your own self-hosted instance** — never against instances or hosted services you don't own.
