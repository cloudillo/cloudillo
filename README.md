<p align="center">
  <a href="https://cloudillo.org">
    <img src="logo/logo-opt-text-horizontal.svg" alt="Cloudillo" width="400">
  </a>
</p>

<p align="center">
  <strong>Your Data, Your Rules</strong><br>
  Open-source, self-hosted collaboration platform with real-time editing, privacy-first design, and no vendor lock-in.
</p>

<p align="center">
  <a href="https://github.com/cloudillo/cloudillo/actions/workflows/ci.yml"><img src="https://github.com/cloudillo/cloudillo/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/cloudillo/cloudillo/blob/main/COPYING"><img src="https://img.shields.io/github/license/cloudillo/cloudillo?color=blue" alt="License"></a>
  <a href="https://github.com/cloudillo/cloudillo/stargazers"><img src="https://img.shields.io/github/stars/cloudillo/cloudillo?style=social" alt="GitHub Stars"></a>
  <a href="https://hub.docker.com/r/cloudillo/cloudillo"><img src="https://img.shields.io/docker/pulls/cloudillo/cloudillo" alt="Docker Pulls"></a>
  <a href="https://github.com/cloudillo/cloudillo/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome"></a>
</p>

---

## What is Cloudillo?

Online collaboration platforms typically fall into two categories:

1. **Cloud-based services:** Convenient but may raise concerns about privacy, bias, ads, and censorship.
2. **Self-hosted applications:** Provide flexibility but challenging to set up and don't integrate well with each other.

Cloudillo bridges this gap — a **decentralized, self-hosted alternative to Google Workspace** that connects users with the convenience of cloud services without sacrificing privacy and control over data.

Learn more at [cloudillo.org](https://cloudillo.org).

## Key Features

- **End-to-end data ownership** — Your data stays on your server, under your control
- **DNS-based portable identity** — Your identity is tied to your domain, not a platform
- **Real-time collaboration** — CRDT-powered (Yjs) simultaneous editing with cursor awareness
- **Passwordless authentication** — WebAuthn/passkey login with no passwords to manage
- **Microfrontend plugin architecture** — Sandboxed apps communicate via typed message bus
- **Federation between instances** — Connect and collaborate across independent Cloudillo servers
- **Self-hosted with Docker** — Easy deployment with official Docker images

## Apps

| App | Description |
|-----|-------------|
| **Shell** | Web dashboard, app launcher, identity management, file manager, social feed, gallery, and messaging |
| **Quillo** | Rich text document editor (Quill + Yjs CRDT) with real-time collaborative editing |
| **Prezillo** | Presentation editor with SVG canvas, shape/text tools, and real-time collaboration |
| **Calcillo** | Spreadsheet with formulas, cell formatting, and multi-sheet workbooks (Fortune Sheet) |
| **Taskillo** | Task list and project management with real-time updates (RTDB) |
| **Formillo** | Survey and form builder with multiple question types and response aggregation |
| **Notillo** | Wiki and notes with hierarchical pages, tags, and block-level editing (BlockNote + RTDB) |
| **Ideallo** | Collaborative whiteboard with freeform drawing, shapes, and diagrams (SVG + Yjs) |
| **Scanillo** | Document scanner with camera capture, image processing, and PDF export |
| **Mapillo** | Map viewer with geolocation, geocoding, POI queries, and dark mode (MapLibre GL) |

## Tech Stack

**Frontend:** TypeScript, React 19, Jotai, i18next · **Real-time:** Yjs 13 (CRDT), custom RTDB · **Auth:** WebAuthn (passkeys) · **Build:** esbuild, pnpm 9 · **Backend:** Rust ([cloudillo-rs](https://github.com/cloudillo/cloudillo-rs)) · **Deploy:** Docker

## Repository Structure

```
cloudillo/
├── shell/       # Main web dashboard and application container
├── apps/        # Plugin apps (Quillo, Prezillo, Calcillo, Taskillo, ...)
├── libs/        # Shared libraries (core SDK, React components, CRDT, RTDB, ...)
└── storybook/   # Component storybook
```

For the **server implementation**, visit **[cloudillo-rs](https://github.com/cloudillo/cloudillo-rs)**.

## Getting Started

> Cloudillo is currently in **alpha**. We publish Docker images regularly on [Docker Hub](https://hub.docker.com/r/cloudillo/cloudillo).

For complete installation instructions including the server setup, please visit the **[cloudillo-rs repository](https://github.com/cloudillo/cloudillo-rs)**.

### Building Frontend and Apps

Ensure you have [pnpm](https://pnpm.io/installation) installed.

```bash
git clone https://github.com/cloudillo/cloudillo.git
cd cloudillo
pnpm install
pnpm -r build
```

This builds the shell (`shell/dist/`), apps (`apps/*/dist/`), and libraries (`libs/*/dist/`). The built frontend needs to be served by the Cloudillo Rust server.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## Community

- **Website:** [cloudillo.org](https://cloudillo.org)
- **Issues:** [GitHub Issues](https://github.com/cloudillo/cloudillo/issues)
- **Discussions:** [GitHub Discussions](https://github.com/cloudillo/cloudillo/discussions)

## License

Cloudillo is licensed under the [GNU Lesser General Public License v3.0 or later](COPYING).
