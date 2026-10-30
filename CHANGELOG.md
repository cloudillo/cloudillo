# Changelog

All notable changes to the Cloudillo web client (`cloudillo`) are listed here. The server, the
container image and the crates are in the
[cloudillo-rs changelog](https://github.com/cloudillo/cloudillo-rs/blob/main/CHANGELOG.md), which
has the same version number `X.Y.Z`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Every release has a **Security** section: security fixes and hardening in the web client.
`release.sh` in cloudillo-rs refuses a tag whose version has no section here.

## [0.8.22] - 2026-10-30

### Security
- TOTP two-factor sign-in with an authenticator app.
- Settings show a security log of sign-ins and other account events.
- Administrator UI for scheduled backups, tenant suspension and federation policy (which servers
  this one talks to).
- Settings for signing keys and a ZIP export of the tenant's files, documents, posts and profile.
- The favicon is bundled instead of loaded from cloudillo.org.
- CI actions pinned by commit SHA, installs with `--frozen-lockfile`, `pnpm audit` of production
  dependencies; security policy in `SECURITY.md`.

### Added
- Communities hub in the shell; partnerships moved there, with the access granted to partner
  members (read, take part, keep home roles) chosen when proposing. Filter-aware people and
  community lists with a partner view.
- Messaging rebuilt on the reader-state API: replies, edit and delete for everyone, typing
  indicators, read receipts (switchable under Privacy), pinned messages, in-conversation search,
  media tab, mute, archive, mark as unread and drafts.
- `@idTag` and `@all` mentions, rendered as pills in `RichText`; `@all` can be ignored per group
  or everywhere.
- Group chat roles (admin, moderator, member, observer), join modes (invitation, request, link)
  and community-owned group chats; members can browse and join a community's groups.
- Community badges (verified member, trusted member, patron; bronze to diamond), chosen per
  profile and verified with the issuing community's home node.
- Prezillo slides rail with thumbnails: reorder, duplicate and skip slides; speaker notes, kept
  through PPTX import and export.
- Quillo export to HTML, PDF and DOCX.
- Mapillo loads tile sources from the `map.tile_sources` setting.
- Onboarding settings.
- Setting to turn off the `/` and `@` keyboard shortcuts.
- `onTokenChange` subscription on `AppMessageBus`; `ViewEmbed` hosts can set the container
  `tabIndex`.

### Changed
- Relicensed from LGPL to MPL-2.0.
- React and React DOM 19.3.1; dependency updates.

### Fixed
- `useCloudillo` follows shell token rotation.
- File images no longer refetch on token rotation.
- Scanillo no longer re-resolves temporary IDs on token rotation.
- Relayed embed tokens survive iframe reloads.
- The viewed profile is kept on context switch.
- The gradient stop colour input has an `aria-label`.
