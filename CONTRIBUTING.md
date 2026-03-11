# Contributing to Cloudillo

Thank you for your interest in contributing to Cloudillo! The project is currently in **alpha**, and we appreciate all contributions — whether it's bug reports, feature suggestions, documentation improvements, or code.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/installation) 9+

### Getting Started

```bash
git clone https://github.com/cloudillo/cloudillo.git
cd cloudillo
pnpm install
pnpm -r build
pnpm test
```

### Development Watch Mode

```bash
pnpm -C shell dev         # Watch mode for shell
pnpm -C apps/quillo watch # Watch mode for an app
```

## Code Style

- **Indentation:** Tabs (width 4)
- **Line width:** 100 characters
- **Quotes:** Single quotes
- **Semicolons:** Optional
- **Trailing commas:** None
- **Formatter:** [Biome](https://biomejs.dev/)

Run `pnpm format` to auto-format, or `pnpm format:check` to verify.

## Commit Convention

We use conventional commits:

```
type(scope): short description
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`

**Scopes:** `shell`, `core`, `react`, `types`, `rtdb`, `crdt`, or an app name (e.g., `quillo`, `taskillo`)

Examples:
- `feat(quillo): add image embedding support`
- `fix(shell): correct token refresh timing`
- `chore: update dependencies`

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes, following the code style above
3. Run `pnpm format` and `pnpm test` before submitting
4. Open a PR with a clear description of the changes
5. Link any related issues

## Architecture Notes

- **Libraries build in dependency order:** types → core → crdt → react → rtdb → canvas-tools → canvas-text
- **Apps run in sandboxed iframes** and communicate with the shell via a typed message bus
- **Two real-time systems:** Yjs (CRDT) for document editing, RTDB for structured data
- **Styling** uses OpalUI (`@symbion/opalui`) CSS classes and `@cloudillo/react` components

## Questions?

Open a [GitHub Discussion](https://github.com/cloudillo/cloudillo/discussions) or file an [issue](https://github.com/cloudillo/cloudillo/issues).
