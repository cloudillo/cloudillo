# @cloudillo/fonts

Curated open-source font collection for [Cloudillo](https://cloudillo.org) and other web apps — static TTF fonts, plus one variable woff2 family for UI text, with an auto-download script.

Each face is a single static TTF built from the full upstream `google/fonts` file (no subsetting), used by browser CSS, text layout and PDF export alike. Serve them precompressed (brotli/gzip); the Cloudillo shell build does.

The one exception is `Roboto UI`, a variable woff2 pair (upright and italic, `wght` 100–900, `wdth` pinned to its default, no subsetting) so on-screen UI text gets every weight. It is for UI text only: it is not a selectable font and has no metrics, and documents keep the static `Roboto` that layout and PDF export measure. Building it needs Python `fonttools` and `brotli`; without them the downloader warns and carries on, and `Roboto UI` falls back to `Roboto` in a font stack that names both.

The package ships with fonts pre-downloaded under `fonts/`. A `postinstall` step re-runs the downloader (idempotent — skips fonts already present).

## Install

    npm install @cloudillo/fonts

## Usage

```ts
import '@cloudillo/fonts/fonts.css'
```

## Included families

Sans-serif: Noto Sans, Lato, Poppins, Roboto, Open Sans, Montserrat, Inter, Nunito Sans, Work Sans, Raleway, DM Sans, Source Sans 3.
Serif: DM Serif Display, Playfair Display, Merriweather, Lora, Crimson Pro, Source Serif 4.
Display: Bebas Neue, Abril Fatface, Permanent Marker, Oswald.
Monospace: JetBrains Mono.

See `scripts/download-fonts.js` for the canonical list.

Fallback faces: Noto Sans (selectable) covers glyphs a family lacks; Noto Sans SC (~10 MB per face,
not selectable) covers Han/kana/bopomofo and is loaded only for CJK text.

## Links

- Website: https://cloudillo.org
- Source: https://github.com/cloudillo/cloudillo/tree/main/libs/fonts
- Issues: https://github.com/cloudillo/cloudillo/issues

## License

The package code is MPL-2.0. The fonts are under their upstream licenses (OFL or Apache-2.0); the
license file sits in each font directory.
