# @cloudillo/fonts

Curated open-source font collection for [Cloudillo](https://cloudillo.org) and other web apps — variable fonts with an auto-download script.

The package ships with fonts pre-downloaded under `fonts/`. A `postinstall` step re-runs the downloader (idempotent — skips fonts already present).

## Install

    npm install @cloudillo/fonts

## Usage

```ts
import '@cloudillo/fonts/fonts.css'
```

## Included families

Sans-serif: Lato, Poppins, Roboto, Open Sans, Montserrat, Inter, Nunito Sans, Work Sans, Raleway, DM Sans, Source Sans 3.
Serif: DM Serif Display, Playfair Display, Merriweather, Lora, Crimson Pro, Source Serif 4.
Display: Bebas Neue, Abril Fatface, Permanent Marker, Oswald.
Monospace: JetBrains Mono.

See `scripts/download-fonts.js` for the canonical list.

## Links

- Website: https://cloudillo.org
- Source: https://github.com/cloudillo/cloudillo/tree/main/libs/fonts
- Issues: https://github.com/cloudillo/cloudillo/issues

## License

LGPL-3.0-or-later
