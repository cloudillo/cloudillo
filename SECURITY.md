# Security policy

## Scope

In scope: the Cloudillo web client in this repository (shell, apps and libraries), the Cloudillo
server ([`cloudillo-rs`](https://github.com/cloudillo/cloudillo-rs)), the official container image
`cloudillo/cloudillo`, the federation protocol as implemented by the server, and the build and
release chain (Dockerfile, CI workflows, release scripts). Vulnerabilities in a dependency that
affect Cloudillo are in scope too; we pass them on to the component's maintainer.

Out of scope: the configuration of a particular deployment (report it to that deployment's
operator), denial-of-service tests and social engineering against instances you do not own, and the
marketing website.

## How to report

- **E-mail:** `security@cloudillo.org`
- **GitHub:** [private vulnerability reporting](https://github.com/cloudillo/cloudillo/security/advisories/new)
  on this repository (or on `cloudillo/cloudillo-rs` for server issues).

Do **not** open a public issue, pull request or discussion for a suspected vulnerability.

Please include the affected component and version (or image digest / commit hash), steps to
reproduce or a proof of concept, the expected impact, whether you believe it is being exploited,
and how you want to be credited. English or Hungarian is fine.

If you research in good faith, use only accounts and instances you own or are authorised to test,
avoid privacy violations, data destruction and service degradation, and stop and report as soon as
you reach another user's data, we will not pursue legal action against you for that research.

## Response times

| Step | Commitment |
|---|---|
| Acknowledge receipt | within 2 working days |
| Initial assessment (confirmed or not, CVSS severity, affected versions) | within 7 days of the acknowledgement |
| Status updates | at least every 14 days until the fix is released |

Fix deadlines, counted from confirmation (severity by CVSS v3.1 base score):

| Severity | Deadline |
|---|---|
| Exploited in the wild | workaround within 72 hours, fix within 7 days |
| Critical (9.0–10.0) | 7 days |
| High (7.0–8.9) | 30 days |
| Medium (4.0–6.9) | 90 days |
| Low (0.1–3.9) | next planned release |

We ask reporters to keep details private until the advisory is published or 90 days after
confirmation, whichever comes first. Advisories are published as GitHub security advisories with the
fixing release; vulnerabilities of medium or higher severity get a CVE ID.

## Supported versions

Security fixes are provided for the latest release. Until a long-term-support line is introduced,
that is the newest image built from `main`.
