// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The site serializer: Notillo's compact block records in, an HTML string out.
 *
 * An independent read-only reader of the format — **no BlockNote and no ProseMirror
 * on the public path**. The format is declared in `rtdb/types.ts`.
 *
 * **Notillo's editorial comments are structurally excluded**: no code path below
 * emits them, not a setting and not a check. They are what collaborators write about
 * a draft, and publishing them would leak review discussion with no visible symptom.
 *
 * Every block type in `BLOCK_TYPE_TO_LONG` has a branch here, plus `documentEmbed`
 * and `index`. Interactivity is marked as an island — `image` (`enhance`), `video`,
 * `audio`, `documentEmbed` (`replace`) — each carrying the placeholder a crawler and
 * a JS-off reader see. Everything else is static, `checkListItem` as a **disabled**
 * checkbox (see `renderListItem`).
 */

import type {
	FileVariant,
	SiteIslandSpec,
	SiteSerializerOptions,
	SiteSourceBlock
} from '@cloudillo/core'
import {
	escapeHtml,
	getFileUrl,
	getOptimalVideoVariant,
	parseSiteFileRef,
	renderSiteIslandAttrs,
	safeHref,
	safeIslandShape,
	siteIslandPlaceholder,
	siteIslandProps,
	siteIslandSpec,
	sitePositiveInt,
	tAnyValue
} from '@cloudillo/core'
import * as T from '@symbion/runtype'

import { normalizeSiteInline, siteBlockType } from '../../rtdb/transform.js'
import type {
	CompactColorStyles,
	CompactTableContent,
	SiteInline,
	StoredBlockRecord
} from '../../rtdb/types.js'
import { decodeSiteInline, isCompactTableContent } from '../../rtdb/types.js'
import { siteListingQuery } from '../listing.js'
import { attr } from './escape.js'
import { renderListing } from './listing.js'

/**
 * A source block with its content narrowed to Notillo's storage format.
 * `SiteSourceBlock.c` is `unknown` in `@cloudillo/core`, which never reads it — the
 * compact shape belongs to this app, so narrowing happens here rather than putting a
 * second copy of the wire format in a shared library.
 */
export type NotilloSourceBlock = Omit<SiteSourceBlock, 'c'> & Pick<StoredBlockRecord, 'c'>

/**
 * The order blocks are read in: `o`, with the id breaking ties.
 *
 * The tie-break is load-bearing. Without it an unchanged page would serialize into a
 * different byte string on a republish whenever two blocks share an `o`, and its ETag
 * would change for no reason. Every consumer of block order calls this — the tree
 * walk, the summary, and the publisher's own pre-pass in `container.ts`.
 */
export function compareBlocks(a: NotilloSourceBlock, b: NotilloSourceBlock): number {
	return a.o - b.o || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// ── Styling common to blocks, inline runs and table cells ──

/** Style flag -> element, innermost first, so the wrapping below reads outward. */
const STYLE_TAGS: [string, string][] = [
	['c', 'code'],
	['s', 's'],
	['u', 'u'],
	['i', 'em'],
	['b', 'strong']
]

/**
 * A stored prop that has to end up as an attribute value, or nothing.
 *
 * Coercion, not vetting: `pr` is a `Record<string, unknown>` off the document, and
 * `escapeHtml` keeps its `string` signature so its call sites stay auditable. What
 * the *value* may be is decided by the server, which walks the published markup
 * against an allowlist at upload (`cloudillo-file`'s `site_html`).
 */
function propString(value: unknown): string | undefined {
	return typeof value === 'string' && value ? value : undefined
}

/**
 * A stored prop as a CSS *colour*, or nothing.
 *
 * Not a coercion like `propString`: this value is interpolated into `style="…"`, and
 * `escapeHtml` only keeps the attribute well-formed — it does not stop a second
 * declaration inside it. A stored `textColor` of
 * `red;position:fixed;inset:0;background:url(https://evil/x)` is a full-viewport
 * overlay and an external beacon on the owner's own origin, and the server does not
 * catch it: `site_html.rs` allows `style` on every element and inspects only
 * `href`/`src`/`srcset` values, under a `style-src 'self' 'unsafe-inline'` CSP.
 *
 * BlockNote's own domain is named palette tokens (`gray`, `red`, …) plus `default`
 * where the theme decides, so a bare word or a hex literal is the whole real value
 * space. Excluding `;`, `:`, `(`, `)`, `/` and whitespace is what blocks both the
 * extra declaration and `url(…)`.
 *
 * ponytail: a two-pattern allowlist, not a CSS value parser. A palette that grows
 * `rgb()`/`hsl()`/`color-mix()` needs the parser — do not widen the regex, since the
 * function call syntax is exactly what makes `url(…)` reachable again.
 */
function colorValue(value: unknown): string | undefined {
	const raw = propString(value)
	if (raw === undefined || raw === 'default') return undefined
	return /^[a-zA-Z]+$/.test(raw) || /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : undefined
}

function colorDeclarations(textColor: unknown, backgroundColor: unknown): string[] {
	const parts: string[] = []
	const color = colorValue(textColor)
	const background = colorValue(backgroundColor)
	if (color) parts.push(`color:${color}`)
	if (background) parts.push(`background-color:${background}`)
	return parts
}

function colorStyle(colors: CompactColorStyles | undefined): string | undefined {
	const parts = colorDeclarations(colors?.tc, colors?.bg)
	return parts.length ? parts.join(';') : undefined
}

/** Every alignment that reaches the style attribute; `left` is the default. */
const ALIGNMENTS = ['center', 'right', 'justify']

/**
 * Block and cell props spell their colours out (`textColor`, `backgroundColor`)
 * where an inline run abbreviates them (`tc`, `bg`), and they may carry an
 * alignment too.
 */
function propDeclarations(props: Record<string, unknown> | undefined): string[] {
	const parts = colorDeclarations(props?.textColor, props?.backgroundColor)
	// The closed set, for the reason `colorValue` states — the value lands in
	// `style="…"`. `left` is the default and emits nothing, so BlockNote's own value
	// for it is the one alignment that stays out of the style attribute.
	const align = ALIGNMENTS.find((a) => a === props?.textAlignment)
	if (align) parts.push(`text-align:${align}`)
	return parts
}

function styleAttr(declarations: string[]): string {
	return declarations.length ? attr('style', declarations.join(';')) : ''
}

function stringProp(props: Record<string, unknown> | undefined, name: string): string {
	const value = props?.[name]
	return typeof value === 'string' ? value : ''
}

// ── Inline content ──

function renderStyledText(text: string, flags: string, colors?: CompactColorStyles): string {
	let html = escapeHtml(text)
	for (const [flag, tag] of STYLE_TAGS) {
		if (flags.includes(flag)) html = `<${tag}>${html}</${tag}>`
	}
	const style = colorStyle(colors)
	return style === undefined ? html : `<span${attr('style', style)}>${html}</span>`
}

/**
 * One stored inline run, decoded. Both steps are needed: `normalizeSiteInline`
 * converts a block not retyped since the compact format landed, without which every
 * branch below misses and the prose vanishes; `decodeSiteInline` then narrows to one
 * of six shapes, an unreadable run costing itself its markup and never the publish.
 *
 * It is also what lets everything below hand values to `escapeHtml` directly — a
 * stored `[42, 'b']` would otherwise reach it as a number and throw out of the whole
 * container build.
 */
function siteInline(raw: unknown): SiteInline | undefined {
	return decodeSiteInline(normalizeSiteInline(raw))
}

function renderInlineItem(raw: unknown, opts: SiteSerializerOptions): string {
	const item = siteInline(raw)
	if (item === undefined) return ''

	if (typeof item === 'string') return escapeHtml(item)
	if (Array.isArray(item)) {
		const [text, flags, colors] = item
		return renderStyledText(text, flags, colors)
	}

	if ('l' in item) {
		// `tSiteLink.l` is a bare `T.string` off the document, so it is author text
		// reaching an anchor on a public page. A refused target keeps its text with
		// no anchor, as a refused nav target does in the shell's `SiteBar`.
		const href = safeHref(item.l)
		const text = renderInline(item.c, opts)
		return href === undefined ? text : `<a${attr('href', href)}>${text}</a>`
	}

	if ('wl' in item) {
		const href = opts.resolvePageHref?.(item.wl)
		const label = escapeHtml(opts.resolvePageTitle?.(item.wl) || item.wt)
		// An unresolved target is a draft, a deleted page or another container.
		return href === undefined
			? `<span class="cl-site-wikilink">${label}</span>`
			: `<a class="cl-site-wikilink"${attr('href', href)}>${label}</a>`
	}

	// Until a publisher supplies `resolveTagHref` the tag stays readable but inert.
	const href = opts.resolveTagHref?.(item.tg)
	const label = `#${escapeHtml(item.tg)}`
	return href === undefined
		? `<span class="cl-site-tag">${label}</span>`
		: `<a class="cl-site-tag"${attr('href', href)}>${label}</a>`
}

/**
 * One run of inline content as HTML.
 *
 * `unknown[]` in, because a stored `c` is a list of whatever the document holds —
 * `renderInlineItem` is what decides what each item is.
 */
export function renderInline(
	content: readonly unknown[] | undefined,
	opts: SiteSerializerOptions = {}
): string {
	if (!content?.length) return ''
	return content.map((item) => renderInlineItem(item, opts)).join('')
}

/** The same run as plain text, for code blocks and for anything deriving a summary. */
export function inlineText(
	content: readonly unknown[] | undefined,
	opts: SiteSerializerOptions = {}
): string {
	if (!content?.length) return ''
	return content
		.map((raw) => {
			const item = siteInline(raw)
			if (item === undefined) return ''
			if (typeof item === 'string') return item
			if (Array.isArray(item)) return item[0]
			if ('l' in item) return inlineText(item.c, opts)
			if ('wl' in item) return opts.resolvePageTitle?.(item.wl) || item.wt
			return `#${item.tg}`
		})
		.join('')
}

// ── Summaries ──

/** Longest a derived meta description gets. */
const SUMMARY_MAX = 160

/**
 * Block types a summary steps over: a heading usually restates the title, which a
 * search result would then show twice, and a code block is not prose.
 */
const SUMMARY_SKIP = new Set(['heading', 'codeBlock'])

/**
 * A page's own first ~160 characters, for a `description` with no override. Top-level
 * blocks only: a nested list item pulled out of its parent reads as a non-sequitur.
 * Truncation falls back to the last word boundary.
 */
export function siteSummary(
	blocks: NotilloSourceBlock[],
	max = SUMMARY_MAX,
	opts: SiteSerializerOptions = {}
): string | undefined {
	const ordered = [...blocks].sort(compareBlocks)
	let text = ''
	for (const block of ordered) {
		if (block.pb || SUMMARY_SKIP.has(siteBlockType(block.t))) continue
		const part = Array.isArray(block.c) ? inlineText(block.c, opts).trim() : ''
		if (!part) continue
		text = text ? `${text} ${part}` : part
		if (text.length > max) break
	}

	if (!text) return undefined
	if (text.length <= max) return text
	const cut = text.slice(0, max + 1)
	const space = cut.lastIndexOf(' ')
	const kept = space > 0 ? cut.slice(0, space) : text.slice(0, max)
	return `${kept.replace(/[\s,;:.!?-]+$/, '')}…`
}

// ── Media ──

const IMAGE_VARIANT_PREFIX = 'vis.'

/** Transcoded playback renditions, as against `vis.*` display stills. */
const VIDEO_VARIANT_PREFIX = 'vid.'

/**
 * `vis.tn` is a 150px thumbnail. Offered as a `srcset` candidate the browser would
 * pick it for a narrow container and the image would look terrible, so the ladder
 * starts one rung up.
 */
const EXCLUDED_IMAGE_VARIANT = 'vis.tn'

/**
 * What a browser that ignores `srcset` gets. `?variant=` is a **selector, not an exact
 * name** — `get_best_file_variant` in the backend's `cloudillo-file` crate resolves
 * `md` down through `sd` and `tn` — so the `src` names what it wants and asking for a
 * rendition the file lacks does not 404.
 */
const PREFERRED_IMAGE_VARIANT = 'vis.md'

/** `sizes` fallback when the author set no preview width. */
const DEFAULT_DISPLAY_WIDTH = 720

/**
 * What the `image` island hands its lightbox. Bigger than the inline `src` on
 * purpose — a lightbox fills the viewport — and still a selector, so a file that
 * never got an `hd` rendition resolves down rather than 404ing.
 */
const LIGHTBOX_IMAGE_VARIANT = 'vis.hd'

/**
 * Display renditions of a file, narrowest first.
 *
 * A variant with no parsed width is dropped rather than guessed at: a `srcset`
 * candidate needs a `w` descriptor to mean anything, and inventing one from the
 * variant's nominal threshold would misdescribe an image that was never that wide.
 */
function imageVariants(all: FileVariant[] | undefined): FileVariant[] {
	return (all ?? [])
		.filter(
			(variant) =>
				variant.variant.startsWith(IMAGE_VARIANT_PREFIX) &&
				variant.variant !== EXCLUDED_IMAGE_VARIANT &&
				variant.width !== undefined
		)
		.sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
}

/**
 * The whole ladder for one managed image. The publisher has no viewport and what it
 * emits is baked in until the next publish, so it emits every display rendition the
 * file has and lets the browser choose. `data-cl-file` carries the fileId so
 * verification reads an attribute rather than re-parsing these URLs.
 */
function managedImage(
	fileId: string,
	idTag: string,
	alt: string,
	props: Record<string, unknown> | undefined,
	opts: SiteSerializerOptions
): string {
	const variants = imageVariants(opts.resolveFile?.(fileId))
	const previewWidth = sitePositiveInt(props?.previewWidth)
	const displayWidth = previewWidth ?? DEFAULT_DISPLAY_WIDTH

	// Every rendition is a scaled copy of the same picture, so the widest one carries
	// the aspect ratio that `width`/`height` exist to reserve.
	const intrinsic = variants[variants.length - 1]

	const srcset =
		variants.length > 1
			? variants
					.map(
						(variant) =>
							`${getFileUrl(idTag, fileId, variant.variant)} ${variant.width}w`
					)
					.join(', ')
			: undefined

	return (
		`<img${attr('data-cl-file', fileId)}` +
		`${attr('src', getFileUrl(idTag, fileId, PREFERRED_IMAGE_VARIANT))}` +
		`${attr('srcset', srcset)}` +
		`${attr('sizes', srcset && `(max-width: ${displayWidth}px) 100vw, ${displayWidth}px`)}` +
		`${attr('width', intrinsic?.width?.toString())}` +
		`${attr('height', intrinsic?.height?.toString())}` +
		// The author's drag-resized width, which BlockNote stores in plain CSS px and
		// applies the same way. `width`/`height` above stay the intrinsic aspect
		// reservation; `#cl-site-content img { max-width: 100%; height: auto }` makes
		// the pair behave. Absent, no style at all — BlockNote's `fit-content` default.
		`${styleAttr(previewWidth === undefined ? [] : [`width:${previewWidth}px`])}` +
		` loading="lazy"${attr('alt', alt)}>`
	)
}

/**
 * Playback renditions of a file, by name — or nothing, which is what
 * `getOptimalVideoVariant` wants when a file has none it can name.
 */
function videoVariantNames(all: FileVariant[] | undefined): string[] | undefined {
	const names = (all ?? [])
		.map((variant) => variant.variant)
		.filter((variant) => variant.startsWith(VIDEO_VARIANT_PREFIX))
	return names.length ? names : undefined
}

function figure(className: string, inner: string, caption: string, extra = ''): string {
	const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
	return `<figure class="${className}"${extra}>${inner}${figcaption}</figure>`
}

// ── Islands ──

/**
 * The `data-cl-block` / `data-cl-id` / `data-props` triple marking one island, always
 * composed through `@cloudillo/core` so writer and reader cannot drift apart.
 *
 * `image`, `video` and `audio` compose their props by hand: those are managed-file
 * references resolved against a file's actual renditions, knowledge no manifest can
 * carry. Everything else takes the declaration-driven path.
 */
function islandAttrs(
	blockType: string,
	block: NotilloSourceBlock,
	props: Record<string, unknown>
): string {
	return renderSiteIslandAttrs({ blockType, blockId: block.id, props })
}

/** Drops the empty and the absent, so `data-props` carries no `"name":""` noise. */
function islandProps(entries: Record<string, unknown>): Record<string, unknown> {
	const props: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(entries)) {
		if (value !== undefined && value !== '') props[key] = value
	}
	return props
}

/**
 * An image block. `props.url` is normally the opaque `cl-file:` scheme, but a pasted
 * external address is stored verbatim, so both are handled — the second through
 * `safeHref`, since it is author-controlled. A refused address drops the block
 * outright, the path an absent `url` already took.
 *
 * The server does reject a bad `src` (`is_safe_fragment_href` in `site_html.rs`), but
 * by failing the *whole container upload* with an opaque error, and `buildPublishReport`
 * checks no URLs — so without this one bad link makes the site unpublishable with no
 * clue which block is at fault. Not surfaced in the report as a per-block finding:
 * that is the more useful behaviour and the larger change.
 *
 * The `<figure>` is an **`enhance`** island: the `<img>` inside it is the real content
 * and stays as emitted, so the picture lays out with JS off. Mounting must not clear
 * it — it only attaches lightbox behaviour.
 */
function renderImage(block: NotilloSourceBlock, opts: SiteSerializerOptions): string {
	const props = block.pr
	const caption = stringProp(props, 'caption')
	const alt = caption || stringProp(props, 'name')
	const ref = parseSiteFileRef(props?.url)

	if (ref && opts.ownerIdTag) {
		const island = islandProps({
			fileId: ref.fileId,
			src: getFileUrl(opts.ownerIdTag, ref.fileId, LIGHTBOX_IMAGE_VARIANT),
			alt
		})
		return figure(
			'cl-site-image',
			managedImage(ref.fileId, opts.ownerIdTag, alt, props, opts),
			caption,
			// `<img>` is inline-level, so the block's own `textAlignment` on the
			// figure is what centres it — no extra CSS, and it was dropped before.
			islandAttrs('image', block, island) + styleAttr(propDeclarations(props))
		)
	}

	const src = safeHref(props?.url)
	if (src === undefined) return ''
	return figure(
		'cl-site-image',
		`<img${attr('src', src)} loading="lazy"${attr('alt', alt)}>`,
		caption,
		islandAttrs('image', block, islandProps({ src, alt })) + styleAttr(propDeclarations(props))
	)
}

/**
 * Video, audio and plain-file blocks as their static placeholder: a link to the file,
 * its name as text, and for video a poster at the right dimensions so the swap does
 * not reflow. The play affordance is CSS, never a label — this module has no i18n
 * context and a baked-in English word outlives every later fix.
 *
 * Video and audio are **`replace`** islands, so the placeholder sits in a marked
 * element *inside* the `<figure>` rather than being it: mounting clears that element,
 * and the authored `<figcaption>` must survive. `file` is not an island — a download
 * link is already the whole behaviour.
 */
function renderMedia(
	block: NotilloSourceBlock,
	opts: SiteSerializerOptions,
	kind: 'video' | 'audio' | 'file'
): string {
	const props = block.pr
	const caption = stringProp(props, 'caption')
	const name = stringProp(props, 'name')
	const ref = parseSiteFileRef(props?.url)
	const idTag = opts.ownerIdTag

	// A no-variant request resolves to `orig`, and when that blob is absent falls back
	// class-blind by quality suffix onto the smaller `vis.*` still — which is how a
	// published video came back an `image/webp` with a dead play button. Filtering to
	// `vid.*` before asking means the helper's "first available variant" fallback can
	// never hand back a still. Audio and `file` keep the bare URL: that is what the
	// editor uses, and a download link wants the original.
	const videoVariant =
		kind === 'video'
			? getOptimalVideoVariant(
					'fullscreen',
					videoVariantNames(ref ? opts.resolveFile?.(ref.fileId) : undefined)
				)
			: undefined

	// A pasted address is author-controlled, so it goes through the allowlist and a
	// refused one drops the block — see `renderImage` for why the server's own check
	// is not enough.
	const href = ref && idTag ? getFileUrl(idTag, ref.fileId, videoVariant) : safeHref(props?.url)
	if (href === undefined) return ''

	// A video's poster comes from the display renditions the file also carries.
	// Same selector as an image's `src`; the descriptor is consulted only for the
	// dimensions that keep the placeholder from reflowing when the island lands.
	const posterVariants =
		kind === 'video' && ref && idTag ? imageVariants(opts.resolveFile?.(ref.fileId)) : []
	const intrinsic = posterVariants[posterVariants.length - 1]
	const posterSrc =
		intrinsic && ref && idTag
			? getFileUrl(idTag, ref.fileId, PREFERRED_IMAGE_VARIANT)
			: undefined
	// The author's drag-resized width, carried by the poster and by the island alike
	// so nothing jumps when the player lands.
	const previewWidth = sitePositiveInt(props?.previewWidth)
	const widthStyle = styleAttr(previewWidth === undefined ? [] : [`width:${previewWidth}px`])

	const poster = posterSrc
		? `<img class="cl-site-media-poster"${attr('src', posterSrc)}` +
			`${attr('width', intrinsic?.width?.toString())}` +
			`${attr('height', intrinsic?.height?.toString())}${widthStyle} loading="lazy" alt="">`
		: ''

	const label = escapeHtml(name || caption || href)
	const inner =
		`<a class="cl-site-media-link"${attr('href', href)}>` +
		`${poster}<span class="cl-site-media-name">${label}</span></a>`

	const marked =
		kind === 'file'
			? inner
			: `<div${islandAttrs(
					kind,
					block,
					islandProps({
						fileId: ref?.fileId,
						src: href,
						name,
						poster: posterSrc,
						width: intrinsic?.width,
						height: intrinsic?.height,
						previewWidth
					})
				)}>${inner}</div>`

	return figure(
		`cl-site-media cl-site-${kind}`,
		marked,
		caption,
		(ref ? attr('data-cl-file', ref.fileId) : '') + styleAttr(propDeclarations(props))
	)
}

/**
 * A `documentEmbed`, as a placeholder holding the authored height so the page does not
 * reflow when the shell swaps the live embed in.
 *
 * Its props go through the declaration in `SITE_BUILTIN_ISLANDS` rather than by hand:
 * they are all literal block props, so this built-in exercises exactly the path an
 * app-declared island takes.
 */
function renderDocumentEmbed(block: NotilloSourceBlock, opts: SiteSerializerOptions): string {
	const fileId = stringProp(block.pr, 'fileId')
	const height = sitePositiveInt(block.pr?.height)
	const spec = siteIslandSpec('documentEmbed', opts.islands)
	const props = spec ? siteIslandProps(spec, block) : {}

	const declarations = height === undefined ? [] : [`height:${height}px`]
	// `width` is a percent (20–100, default 100), not px — mirroring
	// `apps/notillo/src/editor/DocumentEmbed.tsx`, which centres anything below 100.
	const width = sitePositiveInt(block.pr?.width)
	if (width !== undefined && width < 100)
		declarations.push(`width:${width}%`, 'margin-inline:auto')

	return (
		`<div class="cl-site-embed"${attr('data-cl-file', fileId || undefined)}` +
		`${islandAttrs('documentEmbed', block, props)}` +
		`${styleAttr(declarations)}></div>`
	)
}

/**
 * An island a manifest declared and this build knows nothing else about.
 *
 * The placeholder is one of a closed set of shapes, parameterized from block props —
 * never an HTML template supplied by the app. A template would be third-party markup
 * injected into the site owner's own origin, needing a sanitizer and a
 * per-interpolation escaping contract of its own.
 */
function renderDeclaredIsland(
	spec: SiteIslandSpec,
	block: NotilloSourceBlock,
	opts: SiteSerializerOptions
): string {
	const attrs = islandAttrs(spec.blockType, block, siteIslandProps(spec, block))
	const fallback = siteIslandPlaceholder(spec, block)
	const label = fallback.label
		? `<span class="cl-site-island-label">${escapeHtml(fallback.label)}</span>`
		: ''

	if (spec.shape === 'inline') {
		return `<span class="cl-site-island-inline"${attrs}>${label}</span>`
	}

	// A poster is stored the way every other media reference is, so it resolves the
	// same way: the `cl-file:` scheme when it names a managed file, the pasted
	// address as it stands otherwise.
	const ref = parseSiteFileRef(fallback.poster)
	const posterSrc =
		ref && opts.ownerIdTag
			? getFileUrl(opts.ownerIdTag, ref.fileId, PREFERRED_IMAGE_VARIANT)
			: safeHref(fallback.poster)
	const poster =
		spec.shape === 'media' && posterSrc
			? `<img class="cl-site-media-poster"${attr('src', posterSrc)} loading="lazy" alt="">`
			: ''

	const style = styleAttr(fallback.height === undefined ? [] : [`height:${fallback.height}px`])
	// The shape is the one app-controlled value here that reaches an attribute rather
	// than being compared against a literal, and island specs are never runtype-decoded
	// on the way in — so it goes through the allowlist, which folds anything unknown to
	// `box`, the branch this already was.
	return (
		`<div class="cl-site-island-${safeIslandShape(spec.shape)}"${attrs}${style}>` +
		`${poster}${label}</div>`
	)
}

// ── Tables ──

function renderColgroup(widths: (number | undefined)[] | undefined): string {
	if (!widths?.length) return ''
	const cols = widths.map((width) => {
		const px = sitePositiveInt(width)
		return `<col${styleAttr(px === undefined ? [] : [`width:${px}px`])}>`
	})
	return `<colgroup>${cols.join('')}</colgroup>`
}

function renderCell(
	cell: SiteCell,
	rowIdx: number,
	colIdx: number,
	headerRows: number,
	headerCols: number,
	opts: SiteSerializerOptions
): string {
	const content = cell.c
	const props = cell.pr

	const isColHeader = rowIdx < headerRows
	const isHeader = isColHeader || colIdx < headerCols
	const tag = isHeader ? 'th' : 'td'
	const scope = isHeader ? ` scope="${isColHeader ? 'col' : 'row'}"` : ''
	const colspan = sitePositiveInt(props?.colspan)
	const rowspan = sitePositiveInt(props?.rowspan)

	return (
		`<${tag}${scope}` +
		`${attr('colspan', colspan !== undefined && colspan > 1 ? String(colspan) : undefined)}` +
		`${attr('rowspan', rowspan !== undefined && rowspan > 1 ? String(rowspan) : undefined)}` +
		`${styleAttr(propDeclarations(props))}>${renderInline(content, opts)}</${tag}>`
	)
}

/**
 * One stored table row: a `cells` array, whatever else the row carries.
 *
 * `tAnyValue` for a cell because `siteTableCell` below resolves the two cell
 * spellings itself, and `unknownFields: 'drop'` because a row written by a newer
 * generation must not lose its cells over a field this build has not heard of.
 */
const tSiteTableRow = T.struct({ cells: T.array(tAnyValue) })
const TABLE_DECODE_OPTS = { unknownFields: 'drop' } as const

/** A cell in its object spelling: props beside the run. A row may hold bare runs. */
const tSiteTableCell = T.struct({ pr: T.optional(T.record(tAnyValue)), c: T.array(tAnyValue) })

/** Either spelling, resolved to the one shape `renderCell` reads. */
interface SiteCell {
	pr?: Record<string, unknown>
	c: unknown[]
}

function siteTableCell(cell: unknown): SiteCell {
	// A bare inline run is the older spelling and carries no props of its own.
	if (Array.isArray(cell)) return { c: cell }
	const decoded = T.decode(tSiteTableCell, cell, TABLE_DECODE_OPTS)
	return T.isOk(decoded) ? decoded.ok : { c: [] }
}

/**
 * The rows of a stored table, as flat cell lists. `tableContentOf` checks the `type`
 * discriminator and the row list and nothing deeper, so degradation is per row: one
 * malformed table must not fail a publish.
 */
function siteTableRows(rows: unknown): SiteCell[][] {
	const list = T.decode(T.array(tAnyValue), rows, TABLE_DECODE_OPTS)
	if (!T.isOk(list)) return []
	return list.ok.map((row) => {
		const decoded = T.decode(tSiteTableRow, row, TABLE_DECODE_OPTS)
		return T.isOk(decoded) ? decoded.ok.cells.map(siteTableCell) : []
	})
}

function renderTable(table: CompactTableContent, opts: SiteSerializerOptions): string {
	const headerRows = sitePositiveInt(table.hr) ?? 0
	const headerCols = sitePositiveInt(table.hc) ?? 0

	// `tableContentOf` checks the `type` discriminator and nothing else, so the rows
	// themselves are decoded — a table with no `rows` renders nothing rather than
	// throwing out of the whole container build.
	const rows = siteTableRows(table.rows).map((cells, rowIdx) => {
		const rendered = cells.map((cell, colIdx) =>
			renderCell(cell, rowIdx, colIdx, headerRows, headerCols, opts)
		)
		return `<tr>${rendered.join('')}</tr>`
	})
	if (!rows.length) return ''

	const head = headerRows ? `<thead>${rows.slice(0, headerRows).join('')}</thead>` : ''
	const body = rows.slice(headerRows)
	return (
		`<table class="cl-site-table">${renderColgroup(table.cw)}${head}` +
		`<tbody>${body.join('')}</tbody></table>`
	)
}

// ── Blocks ──

interface BlockNode {
	block: NotilloSourceBlock
	children: BlockNode[]
}

function sortNodes(nodes: BlockNode[]): void {
	nodes.sort((a, b) => compareBlocks(a.block, b.block))
}

function buildTree(blocks: NotilloSourceBlock[]): BlockNode[] {
	const nodes = new Map<string, BlockNode>()
	for (const block of blocks) {
		nodes.set(block.id, { block, children: [] })
	}

	const roots: BlockNode[] = []
	for (const node of nodes.values()) {
		const parent = node.block.pb ? nodes.get(node.block.pb) : undefined
		// An absent, null or dangling parent puts the block at the top level, which
		// keeps content visible rather than orphaning it. A `pb` *cycle* gets the
		// same treatment, but cannot be spotted here: every block in a cycle has a
		// parent that resolves, so none of them reaches `roots` and the whole cycle
		// plus its subtree would render as nothing. No UI can create one, but
		// `useEditorSync` writes `pb` field-by-field, so two clients re-nesting A
		// under B and B under A leaves exactly this — hence the second pass below.
		if (parent) parent.children.push(node)
		else roots.push(node)
	}

	// Anything the forest does not reach is in a cycle. Promote it to the top level
	// and cut the link that trapped it, so it renders once rather than twice.
	const reachable = new Set<BlockNode>()
	const stack = [...roots]
	while (stack.length) {
		const node = stack.pop()
		if (!node || reachable.has(node)) continue
		reachable.add(node)
		stack.push(...node.children)
	}
	for (const node of nodes.values()) {
		if (reachable.has(node)) continue
		const parent = node.block.pb ? nodes.get(node.block.pb) : undefined
		if (parent) parent.children = parent.children.filter((child) => child !== node)
		roots.push(node)
		// Its own subtree comes with it, so mark the branch reached before the next
		// trapped node is considered — otherwise a cycle's members each get promoted.
		const sub = [node]
		while (sub.length) {
			const cur = sub.pop()
			if (!cur || reachable.has(cur)) continue
			reachable.add(cur)
			sub.push(...cur.children)
		}
	}

	sortNodes(roots)
	for (const node of nodes.values()) {
		sortNodes(node.children)
	}
	return roots
}

/** The inline run of a block, or nothing when its content is a table instead. */
function inlineContentOf(block: NotilloSourceBlock): unknown[] | undefined {
	return Array.isArray(block.c) ? block.c : undefined
}

function tableContentOf(block: NotilloSourceBlock): CompactTableContent | undefined {
	return isCompactTableContent(block.c) ? block.c : undefined
}

const LIST_WRAPPER: Record<string, string> = {
	bulletListItem: 'ul',
	numberedListItem: 'ol',
	checkListItem: 'ul'
}

/** Only the checklist needs a hook; a plain list is a plain list. */
const LIST_CLASS: Record<string, string> = {
	checkListItem: 'cl-site-checklist'
}

/**
 * Heading levels shift down by one: the archetype layout owns the page's single
 * `<h1>`, so a level-1 heading in the body becomes an `<h2>`. This shows up in
 * stored fragments, so changing it later is a republish, not a redeploy.
 */
function renderHeading(block: NotilloSourceBlock, inline: string): string {
	const raw = Number(block.pr?.level)
	const level = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1) + 1, 6) : 2
	return `<h${level}${styleAttr(propDeclarations(block.pr))}>${inline}</h${level}>`
}

/**
 * Code ships unhighlighted, by decision: adding a highlighter would bundle one into
 * Notillo, and the requirement that none ship on the *public* path is met either
 * way. The `language-<lang>` class is the conventional hook, so highlighting can be
 * added behind this function later without changing what is emitted around it.
 */
function renderCodeBlock(block: NotilloSourceBlock): string {
	const language = propString(block.pr?.language)
	const cls = language === undefined ? undefined : `language-${language}`
	// Styles inside code carry no meaning, so the run is flattened to its text.
	const text = escapeHtml(inlineText(inlineContentOf(block)))
	return `<pre class="cl-site-code"><code${attr('class', cls)}>${text}</code></pre>`
}

/**
 * An `index` block: the rows the publisher resolved for it, in the block's layout.
 *
 * Static, never an island — which pages are published and what they summarise to is
 * publish-time knowledge an anonymous visitor's runtime cannot recover. The
 * serializer cannot see across pages, so it parses the query and asks; with no
 * resolver it renders nothing, as an empty listing does.
 */
function renderIndexBlock(block: NotilloSourceBlock, opts: SiteSerializerOptions): string {
	const query = siteListingQuery(block.pr)
	const entries = opts.resolveListing?.(query)
	return entries?.length ? renderListing(entries, query.layout, opts) : ''
}

function renderNested(children: BlockNode[], opts: SiteSerializerOptions): string {
	if (!children.length) return ''
	return `<div class="cl-site-nested">${renderNodes(children, opts)}</div>`
}

function renderBlock(node: BlockNode, type: string, opts: SiteSerializerOptions): string {
	const block = node.block
	const inline = renderInline(inlineContentOf(block), opts)
	const nested = renderNested(node.children, opts)

	switch (type) {
		case 'paragraph':
			// Emitted even when empty: an empty paragraph is authored spacing.
			return `<p${styleAttr(propDeclarations(block.pr))}>${inline}</p>${nested}`
		case 'heading':
			return renderHeading(block, inline) + nested
		case 'codeBlock':
			return renderCodeBlock(block) + nested
		case 'table': {
			const table = tableContentOf(block)
			return (table ? renderTable(table, opts) : '') + nested
		}
		case 'image':
			return renderImage(block, opts) + nested
		case 'video':
			return renderMedia(block, opts, 'video') + nested
		case 'audio':
			return renderMedia(block, opts, 'audio') + nested
		case 'file':
			return renderMedia(block, opts, 'file') + nested
		case 'documentEmbed':
			return renderDocumentEmbed(block, opts) + nested
		case 'index':
			return renderIndexBlock(block, opts) + nested
		default: {
			// A block type a newer Notillo introduced, or an app's own. If a manifest
			// declared it an island it gets a placeholder; otherwise only its children
			// render, so nesting under something unknown does not take the subtree
			// with it.
			const spec = siteIslandSpec(type, opts.islands)
			return (spec ? renderDeclaredIsland(spec, block, opts) : '') + nested
		}
	}
}

/**
 * The body of one list item. A checklist item leads with a **disabled** checkbox:
 * the state is authored content, and letting a public reader tick it into the void
 * is worse than an obviously static one.
 */
function renderListItem(node: BlockNode, type: string, opts: SiteSerializerOptions): string {
	const inline = renderInline(inlineContentOf(node.block), opts)
	const nested = renderNodes(node.children, opts)
	const style = styleAttr(propDeclarations(node.block.pr))

	if (type !== 'checkListItem') return `<li${style}>${inline}${nested}</li>`

	const checked = node.block.pr?.checked
	const isChecked = checked === true || checked === 'true'
	return (
		`<li${style}><input type="checkbox" disabled${isChecked ? ' checked' : ''}>` +
		`${inline}${nested}</li>`
	)
}

function renderNodes(nodes: BlockNode[], opts: SiteSerializerOptions): string {
	const out: string[] = []
	let i = 0
	while (i < nodes.length) {
		const type = siteBlockType(nodes[i].block.t)
		// `Object.hasOwn`, because `LIST_WRAPPER` is an object literal and `type` is a
		// stored `t` that came through `siteBlockType` unchanged when it was unknown: a
		// stored `t: 'constructor'` would otherwise resolve off the prototype chain —
		// truthy — and take the whole container build down inside `escapeHtml`.
		// `BLOCK_TYPE_TO_LONG` needs no such guard; it is a `Map`.
		const wrapper = Object.hasOwn(LIST_WRAPPER, type) ? LIST_WRAPPER[type] : undefined

		if (wrapper) {
			// The compact format stores every list item as its own block and implies
			// the list, so one wrapper spans each run of same-type siblings.
			const items: string[] = []
			while (i < nodes.length && siteBlockType(nodes[i].block.t) === type) {
				items.push(renderListItem(nodes[i], type, opts))
				i++
			}
			const cls = Object.hasOwn(LIST_CLASS, type) ? LIST_CLASS[type] : undefined
			out.push(`<${wrapper}${attr('class', cls)}>${items.join('')}</${wrapper}>`)
			continue
		}

		out.push(renderBlock(nodes[i], type, opts))
		i++
	}
	return out.join('')
}

/** One page's blocks, in any order, as the body HTML of a fragment. */
export function renderBlocks(
	blocks: NotilloSourceBlock[],
	opts: SiteSerializerOptions = {}
): string {
	return renderNodes(buildTree(blocks), opts)
}

// vim: ts=4
