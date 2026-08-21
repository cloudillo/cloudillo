// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Notillo's storage format, and the validators that read it back.
//
// Everything below the "Stored types" heading crosses a trust boundary: it is what
// an RTDB document holds, written by a Notillo of unknown vintage and read by this
// one. Those shapes are declared validator-first and their types derived, so a
// snapshot is decoded rather than asserted. The app-side shapes (`PageRecord`,
// `BlockRecord`, `InlineContent`) stay plain interfaces — they never come off a
// wire, they are what this build hands BlockNote.

import { tAnyValue } from '@cloudillo/core'
import * as T from '@symbion/runtype'

/**
 * `'drop'` for every stored decode below.
 *
 * A document written by a newer Notillo carries fields this build has never heard
 * of, and refusing it over one of them would make a page disappear from the sidebar
 * rather than render slightly plainly.
 */
const DECODE_OPTS = { unknownFields: 'drop' } as const

// ── BlockNote inline content types (verbose, as BlockNote uses them) ──

export interface StyledText {
	type: 'text'
	text: string
	styles: {
		bold?: boolean
		italic?: boolean
		underline?: boolean
		strikethrough?: boolean
		code?: boolean
		textColor?: string
		backgroundColor?: string
	}
}

export interface Link {
	type: 'link'
	href: string
	content: StyledText[]
}

export interface WikiLinkContent {
	type: 'wikiLink'
	props: { pageId: string; pageTitle: string }
}

export interface TagContent {
	type: 'tag'
	props: { tag: string }
}

export type InlineContent = StyledText | Link | WikiLinkContent | TagContent

// ── Compact inline content types (for RTDB wire/storage) ──

export interface CompactColorStyles {
	tc?: string // textColor
	bg?: string // backgroundColor
}

export interface CompactLink {
	l: string // href
	c: CompactInlineContent[] // content
}

export interface CompactWikiLink {
	wl: string // pageId
	wt: string // pageTitle
}

export interface CompactTag {
	tg: string // tag
}

// ── Pre-compact inline content, as stored records may still hold it ──
//
// Blocks written before `7def7bc feat(notillo): compact block serialization for
// RTDB wire format` carry BlockNote's verbose items instead. Read-side shapes,
// looser than the `StyledText` / `Link` / `WikiLinkContent` / `TagContent` above
// that describe what BlockNote hands *us*: `styles` may be absent altogether in a
// stored record, and a legacy link's content may itself be already-compact.
// `expandContentItem` and `normalizeSiteInline` both accept them.

export interface LegacyStyledText {
	type: 'text'
	text: string
	styles?: Record<string, unknown>
}

export interface LegacyLink {
	type: 'link'
	href: string
	content: CompactInlineContent[]
}

export interface LegacyWikiLink {
	type: 'wikiLink'
	props: { pageId: string; pageTitle: string }
}

export interface LegacyTag {
	type: 'tag'
	props: { tag: string }
}

export type CompactInlineContent =
	| string // unstyled text
	| [string, string] // [text, styleFlags]
	| [string, string, CompactColorStyles] // [text, styleFlags, colors]
	| CompactLink // link
	| CompactWikiLink // wikiLink
	| CompactTag // tag
	| LegacyStyledText // pre-compact styled text
	| LegacyLink // pre-compact link
	| LegacyWikiLink // pre-compact wikiLink
	| LegacyTag // pre-compact tag

// ── Reading inline content back ──
//
// The union above is what this build *writes*; these are what it accepts when it
// reads. Two separate declarations on purpose, the same split `tSiteManifest` and
// `decodeSiteManifest` make in `libs/core/src/site.ts`: the writer's shape is exact,
// the reader's is forgiving, and neither has to compromise for the other.
//
// One decode, shared by every reader of this union: `expandContentItem`,
// `normalizeSiteInline`, and the serializer's `renderInlineItem` and `inlineText`.

const tCompactColorStyles = T.struct({ tc: T.optional(T.string), bg: T.optional(T.string) })

/**
 * A link as *read*: its runs are held undecoded and judged one at a time by whoever
 * walks into them.
 *
 * Not `T.array(tSiteInline)`, which would fail a whole link — text and all — over
 * one unreadable run inside it. Degrade per value, never per document
 * (`libs/core/src/site.ts`, which is also where `tAnyValue` explains itself).
 */
const tSiteLink = T.struct({ l: T.string, c: T.array(tAnyValue) })

const tCompactWikiLink = T.struct({ wl: T.string, wt: T.string })
const tCompactTag = T.struct({ tg: T.string })

/**
 * One inline run, in the compact form, as stored.
 *
 * **Order is load-bearing.** `T.union` returns the first member that decodes, and
 * `T.struct` checks `typeof u === 'object'` without checking `Array.isArray` — so
 * under `'drop'` an array would satisfy a struct whose fields are all optional. The
 * tuples therefore come before the objects. The two tuple lengths are two members
 * rather than one with an optional third element, because `T.tuple` requires an
 * exact length.
 */
export const tSiteInline = T.union(
	T.string,
	T.tuple(T.string, T.string),
	T.tuple(T.string, T.string, tCompactColorStyles),
	tSiteLink,
	tCompactWikiLink,
	tCompactTag
)
export type SiteInline = T.TypeOf<typeof tSiteInline>

/**
 * The four pre-compact shapes, which a block not retyped since `7def7bc` still holds.
 *
 * Every field but the tag itself is optional, matching the `?? ''` fallbacks the
 * conversion has always applied: a legacy item missing its `text` used to become an
 * empty string, and it still does rather than being refused wholesale.
 */
export const tLegacyInline = T.taggedUnion('type')({
	text: T.struct({
		type: T.literal('text'),
		text: T.optional(T.string),
		styles: T.optional(T.record(tAnyValue))
	}),
	link: T.struct({
		type: T.literal('link'),
		href: T.optional(T.string),
		// Undecoded here for the same reason `tSiteLink.c` is.
		content: T.optional(T.array(tAnyValue))
	}),
	wikiLink: T.struct({
		type: T.literal('wikiLink'),
		props: T.optional(
			T.struct({ pageId: T.optional(T.string), pageTitle: T.optional(T.string) })
		)
	}),
	tag: T.struct({
		type: T.literal('tag'),
		props: T.optional(T.struct({ tag: T.optional(T.string) }))
	})
})

/** Decode one stored inline run, or nothing if this build cannot read it. */
export function decodeSiteInline(item: unknown): SiteInline | undefined {
	const decoded = T.decode(tSiteInline, item, DECODE_OPTS)
	return T.isOk(decoded) ? decoded.ok : undefined
}

/** Decode one *pre-compact* inline run, or nothing if it is not one. */
export function decodeLegacyInline(item: unknown): T.TypeOf<typeof tLegacyInline> | undefined {
	const decoded = T.decode(tLegacyInline, item, DECODE_OPTS)
	return T.isOk(decoded) ? decoded.ok : undefined
}

// ── Compact table content (for RTDB wire/storage) ──

export interface CompactTableCell {
	pr?: Record<string, unknown> // props (backgroundColor, textColor, textAlignment, colspan, rowspan)
	c: CompactInlineContent[] // content
}

export interface CompactTableContent {
	type: 'tableContent'
	cw?: (number | undefined)[] // columnWidths
	hr?: number // headerRows
	hc?: number // headerCols
	rows: { cells: CompactInlineContent[][] | CompactTableCell[] }[]
}

// ── Table block helpers ──

export const TABLE_TYPES = new Set(['table', 'tb'])

// Media block types that store data in props (e.g., props.url), not
// in an inline content array. These are valid without array content.
export const MEDIA_TYPES = new Set(['img', 'image', 'vid', 'video', 'aud', 'audio', 'f', 'file'])

/**
 * The two table envelopes, verbose and compact.
 *
 * Deliberately shallow: `rows` is checked as a list, and what is *in* a cell is
 * not. The runs inside are decoded where they are expanded or rendered, one at a
 * time, so a single unreadable run costs itself rather than the whole table. Going
 * deeper here would move that failure up two levels for no gain.
 *
 * Shallow is not the same as partial: the table's own dimensions have to be
 * *declared*, because `DECODE_OPTS` drops unknown fields and `T.struct` rebuilds
 * the object — an undeclared dimension is discarded on the way in, the table
 * renders with no widths and no headers, and the next edit writes that loss back.
 *
 * That is why *both* spellings are declared. A block not retyped since content
 * compaction still carries BlockNote's own `columnWidths`/`headerRows`/`headerCols`,
 * which `expandTableContent` reads as its fallback — and a fallback the decode
 * already dropped can never fire.
 *
 * A width is `nullable` rather than a bare number: BlockNote's own `columnWidths`
 * is `(number | undefined)[]`, and a hole in it arrives from the wire as `null`.
 * Refusing one would fail the whole block's decode and lose the table entirely.
 *
 * Used by `tStoredBlockRecord.c`, which is where those rebuilt fields are kept. The
 * predicate below deliberately does *not* go through it.
 */
const tTableShell = T.struct({
	type: T.literal('tableContent'),
	cw: T.optional(T.array(T.nullable(T.number))),
	hr: T.optional(T.number),
	hc: T.optional(T.number),
	columnWidths: T.optional(T.array(T.nullable(T.number))),
	headerRows: T.optional(T.number),
	headerCols: T.optional(T.number),
	rows: T.array(tAnyValue)
})

/**
 * One check, two names: the shell is what both spellings have in common, and which
 * of the two a value *is* the caller already knows from where it came from.
 *
 * Structural rather than `T.decode(tTableShell, …)`: that copies every row on every
 * call and then throws the copy away, and this runs per table per page open. Only the
 * discriminator and the one field every caller indexes are load-bearing for a
 * predicate; the dimensions are read leniently where they are used.
 */
const isTableShell = (content: unknown): boolean =>
	typeof content === 'object' &&
	content !== null &&
	(content as { type?: unknown }).type === 'tableContent' &&
	Array.isArray((content as { rows?: unknown }).rows)

export const isTableContent = (content: unknown): content is TableContent => isTableShell(content)

export const isCompactTableContent = (content: unknown): content is CompactTableContent =>
	isTableShell(content)

/**
 * A table cell in its object spelling — as opposed to a bare run of inline content,
 * which a row may hold instead.
 *
 * The two are told apart by checking *every* cell, not by sampling `cells[0]`: a row
 * that mixed them would otherwise be mapped wholesale as whichever spelling came first
 * and lose the other's cells. A row that answers `false` here is not lost — it falls to
 * `expandTableCell`, which decides per cell.
 *
 * Structural rather than a decode, for the same reason as `isTableShell` above: a
 * cell shell's `content: T.array(tAnyValue)` copies every run of every cell, and
 * `expandTableCells` asks twice per row.
 */

/** Note: false for an empty row, but both spellings produce `[]` so nothing is lost. */
export function isTableCellArray(cells: InlineContent[][] | TableCell[]): cells is TableCell[] {
	return (
		cells.length > 0 &&
		cells.every(
			(cell) =>
				!Array.isArray(cell) &&
				typeof cell === 'object' &&
				cell !== null &&
				(cell as { type?: unknown }).type === 'tableCell' &&
				Array.isArray((cell as { content?: unknown }).content)
		)
	)
}

export function isCompactTableCellArray(
	cells: CompactInlineContent[][] | CompactTableCell[]
): cells is CompactTableCell[] {
	return (
		cells.length > 0 &&
		cells.every(
			(cell) =>
				!Array.isArray(cell) &&
				typeof cell === 'object' &&
				cell !== null &&
				Array.isArray((cell as { c?: unknown }).c)
		)
	)
}

// ── Block type short/long mappings ──
//
// `Map`, not a plain object: `t` is a free-form stored string, and
// `BLOCK_TYPE_TO_LONG['toString']` on an object literal answers with a function off
// `Object.prototype` — a non-string out of a `string` return type, which then misses
// every `switch` downstream and publishes the block as nothing. A `Map` has no
// prototype chain to walk into, so the hazard is gone structurally rather than
// guarded against at each lookup.

export const BLOCK_TYPE_TO_SHORT = new Map<string, string>([
	['paragraph', 'p'],
	['heading', 'h'],
	['bulletListItem', 'ul'],
	['numberedListItem', 'ol'],
	['checkListItem', 'cl'],
	['table', 'tb'],
	['image', 'img'],
	['video', 'vid'],
	['audio', 'aud'],
	['file', 'f'],
	['codeBlock', 'code']
])

export const BLOCK_TYPE_TO_LONG = new Map<string, string>(
	[...BLOCK_TYPE_TO_SHORT].map(([long, short]) => [short, long])
)

// ── Stored types (compact, for RTDB wire/storage) ──

/**
 * Value of `pp` on a page that sits at the top of the tree — a sentinel of the
 * storage format, which is why it lives here and not in `publish/`.
 */
export const ROOT_PARENT = '__root__'

/**
 * Is this page at the top level?
 *
 * The one fold every consumer applies: an unfiled page (`pp` absent or `null`), a
 * page parented to the sentinel, and a child of the home page are all the same
 * level. `listingParentId` (`publish/listing.ts`) and `childIndexOf`
 * (`publish/tree.ts`) both bucket by exactly this, so the rows an author arranges
 * in the sidebar are the rows that publish.
 */
export function isTopLevel(
	parentPageId: string | null | undefined,
	homePageId: string | undefined
): boolean {
	return (
		!parentPageId ||
		parentPageId === ROOT_PARENT ||
		(homePageId != null && parentPageId === homePageId)
	)
}

export const tStoredPageRecord = T.struct({
	ti: T.string, // title
	ic: T.optional(T.string), // icon
	// '__root__' = root, pageId = child, absent *or null* = unfiled: `removeFromSidebar`
	// unfiles a page by writing `null`, and that null is read back as such.
	pp: T.optional(T.nullable(T.string)),
	// Dead denormalised child indicator: the tree is derived from the full page
	// map, so `hc` is neither written nor read. Older documents still carry it, and
	// it stays declared so their pages still decode.
	hc: T.optional(T.boolean),
	o: T.number, // order
	// Always written, but optional here because a read may be projected: the
	// page map fetches `ti`/`ic`/`pp`/`o`/`tg` only. See `PageRecord`. `ti` and `o`
	// are the two required fields and both are in that projection, which is what
	// lets one validator serve the projected and the unprojected read alike.
	ca: T.optional(T.string), // createdAt
	ua: T.optional(T.string), // updatedAt
	cb: T.optional(T.string), // createdBy
	tg: T.optional(T.array(T.string)), // tags (sorted, deduplicated)
	// ── Site fields ──
	// Spelled out rather than abbreviated to two characters: the keys above repeat
	// per block and per inline run, these hold at most one value per page and are
	// mostly absent, so the wire saving would be negligible and the opacity permanent.
	// All optional and all omitted when never written, but `null` is a real stored
	// value here: `updatePage` clears a field by writing `null`, the same convention
	// `removeFromSidebar` uses for `pp`, and that null survives the read back. Every
	// consumer must treat `null` exactly as it treats an absent field —
	// `T.optional(T.nullable(...))` is that contract, now enforced by the decoder
	// instead of by comment discipline.
	slug: T.optional(T.nullable(T.string)), // absent = derived from the title (drafts only), present = fixed
	draft: T.optional(T.nullable(T.boolean)), // absent/false = published. A publication flag, never an access boundary
	kind: T.optional(T.nullable(T.string)), // archetype: 'page' | 'post'. Absent = inherited
	childKind: T.optional(T.nullable(T.string)), // what a child of this page is. Absent/null = 'page'
	author: T.optional(T.nullable(T.string)), // '@'-prefixed = idTag resolved to a real profile, else free text
	pubAt: T.optional(T.string), // publishedAt, ISO. Written by the publisher on first publish, never cleared
	desc: T.optional(T.nullable(T.string)), // meta description override
	image: T.optional(T.nullable(T.string)), // social image override (fileId)
	noNav: T.optional(T.nullable(T.boolean)) // hide from navigation
})
export type StoredPageRecord = T.TypeOf<typeof tStoredPageRecord>

/**
 * One RTDB page document, or nothing.
 *
 * The unit of failure is the **document**, one level coarser than the per-value rule
 * the serializer follows, because a page with no `ti` has no usable title: without
 * this, `fromStoredPage` handed `undefined` through a `string`-typed field straight
 * into `escapeHtml()` in the publisher. A page that will not decode is skipped and
 * the rest of the collection still loads.
 */
export function decodeStoredPage(data: unknown, docId: string): StoredPageRecord | undefined {
	const decoded = T.decode(tStoredPageRecord, data, DECODE_OPTS)
	if (T.isOk(decoded)) return decoded.ok
	console.warn(`[notillo] Skipping unreadable page ${docId}:`, decodeErrors(decoded.err))
	return undefined
}

/**
 * The document's own settings — one record, at `d/site`.
 *
 * A document-level fact rather than a per-page flag: "exactly one home page" is an
 * invariant of the document, and a per-page boolean lets two concurrent clients
 * flag two different pages with nothing to arbitrate. One field cannot disagree
 * with itself.
 *
 * Keys are spelled out for the same reason the page record's site fields are: there
 * is one of these per document, so the wire saving would be negligible and the
 * opacity permanent. `null` means the author cleared it and reads back as such —
 * test with `== null`, never `=== undefined`.
 */
export const tStoredDocSettings = T.struct({
	siteMode: T.optional(T.nullable(T.boolean)),
	homePageId: T.optional(T.nullable(T.string))
})
export type StoredDocSettings = T.TypeOf<typeof tStoredDocSettings>

/**
 * The settings record, or nothing when this build cannot read it.
 *
 * Same document-level policy as `decodeStoredPage`: a record that will not decode
 * is reported and dropped, and the caller reads that as a document whose site mode
 * has never been turned on — which is what a document with no record at all is.
 */
export function decodeDocSettings(data: unknown): StoredDocSettings | undefined {
	const decoded = T.decode(tStoredDocSettings, data, DECODE_OPTS)
	if (T.isOk(decoded)) return decoded.ok
	console.warn('[notillo] Skipping unreadable document settings:', decodeErrors(decoded.err))
	return undefined
}

/** A page record complete enough to write back — every field the store holds. */
export type FullPageRecord = PageRecord &
	Required<Pick<PageRecord, 'createdAt' | 'updatedAt' | 'createdBy'>>

export const tStoredBlockRecord = T.struct({
	p: T.string, // pageId
	t: T.string, // type (short code or full name)
	pr: T.optional(T.record(tAnyValue)), // props
	// Content, compact format. Its runs stay `unknown` here and are decoded where
	// they are expanded or rendered — `T.array(tSiteInline)` would fail the whole
	// block over one unreadable run, and a paragraph would then vanish from the
	// document with no symptom.
	c: T.optional(T.union(T.array(tAnyValue), tTableShell)),
	pb: T.optional(T.nullable(T.string)), // parentBlockId (null = root)
	o: T.number, // order
	ua: T.string, // updatedAt
	ub: T.optional(T.string) // updatedBy (omitted when owner is the updater)
})
export type StoredBlockRecord = T.TypeOf<typeof tStoredBlockRecord>

/** One RTDB block document, or nothing. Same document-level policy as pages above. */
export function decodeStoredBlock(data: unknown, docId: string): StoredBlockRecord | undefined {
	const decoded = T.decode(tStoredBlockRecord, data, DECODE_OPTS)
	if (T.isOk(decoded)) return decoded.ok
	console.warn(`[notillo] Skipping unreadable block ${docId}:`, decodeErrors(decoded.err))
	return undefined
}

/** Runtype ships no error formatter; both `decodeStored*` above report through this. */
function decodeErrors(errors: T.RTError): string {
	return errors.map((e) => `${e.path.join('.')}: ${e.error}`).join(', ')
}

// ── BlockNote boundary helpers ──
// BlockNote's generic schema makes content/type/props incompatible with our
// serialized types at the boundary. These helpers centralize the single cast
// so that call sites don't need individual `as any` suppressions.

// biome-ignore lint/suspicious/noExplicitAny: BlockNote boundary - content/type/props cross schema boundary
export function asBlockContent(content: unknown): any {
	return content
}

// biome-ignore lint/suspicious/noExplicitAny: BlockNote boundary - block type is a generic string union
export function asBlockType(type: string): any {
	return type
}

// biome-ignore lint/suspicious/noExplicitAny: BlockNote boundary - block props are schema-dependent
export function asBlockProps(props: Record<string, unknown> | undefined): any {
	return props
}

// ── App types (readable, for application code) ──

export interface PageRecord {
	title: string
	icon?: string
	/** '__root__' = root, pageId = child, absent *or null* = unfiled. */
	parentPageId?: string | null
	order: number
	// Written on every mutation, but optional because the page map is loaded with
	// a field projection (`PAGE_FIELDS` in `hooks/useAllPages.ts`). Code that needs
	// them must query without a projection, as `checkConsistency` does.
	createdAt?: string
	updatedAt?: string
	createdBy?: string
	tags?: string[]
	// ── Site fields (see `StoredPageRecord` for what each one means) ──
	// Named as they are stored, except `pubAt`, which decodes to `publishedAt` the
	// way `ca` decodes to `createdAt`. Everything but `author` is in the page-map
	// projection (`PAGE_FIELDS`); that one arrives only on an unprojected read.
	// `null` means the author cleared the field and is read back as such — test
	// these with `== null`, never `=== undefined`.
	slug?: string | null
	draft?: boolean | null
	kind?: string | null
	/**
	 * What a new child of this page is created as, and what a child that names no
	 * `kind` of its own resolves to at publish. Not inherited past one level; absent
	 * or `null` means `page`.
	 */
	childKind?: string | null
	author?: string | null
	publishedAt?: string
	desc?: string | null
	image?: string | null
	noNav?: boolean | null
}

export interface TableCell {
	type: 'tableCell'
	props: Record<string, unknown>
	content: InlineContent[]
}

export interface TableContent {
	type: 'tableContent'
	columnWidths: (number | undefined)[]
	headerRows?: number
	headerCols?: number
	rows: { cells: InlineContent[][] | TableCell[] }[]
}

export interface BlockRecord {
	pageId: string
	type: string
	props?: Record<string, unknown>
	content?: InlineContent[] | TableContent
	parentBlockId?: string | null // null = root, undefined = not specified
	order: number
	updatedAt: string
	updatedBy: string
}

// vim: ts=4
