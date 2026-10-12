# @cloudillo/typeset

Deterministic, DOM-free typesetting engine for [Cloudillo](https://cloudillo.org) — HarfBuzz shaping, UAX#14 line breaking, hyphenation (en, hu, de), pagination and per-page display lists with an SVG renderer. Runs unchanged in a worker or in node.

Layout is computed in fixed-point integers (1/1024 pt) from byte-identical font files, so every client produces the same line breaks.

## Install

    npm install @cloudillo/typeset

## Usage

```ts
import { ptToFx, ENGINE_VERSION, type PageDL } from '@cloudillo/typeset'

const size = ptToFx(11) // 11264
```

## Links

- Website: https://cloudillo.org
- Source: https://github.com/cloudillo/cloudillo/tree/main/libs/typeset
- Issues: https://github.com/cloudillo/cloudillo/issues

## License

LGPL-3.0-or-later
