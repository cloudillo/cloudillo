// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	BlockRecord,
	CompactColorStyles,
	CompactInlineContent,
	CompactTableCell,
	CompactTableContent,
	FullPageRecord,
	InlineContent,
	PageRecord,
	StoredBlockRecord,
	StoredPageRecord,
	TableCell,
	TableContent
} from './types.js'
import {
	asBlockContent,
	BLOCK_TYPE_TO_LONG,
	BLOCK_TYPE_TO_SHORT,
	decodeLegacyInline,
	decodeSiteInline,
	isCompactTableCellArray,
	isCompactTableContent,
	isTableCellArray,
	isTableContent
} from './types.js'

// ── Style flag encoding ──

const STYLE_FLAG_MAP: Record<string, string> = {
	bold: 'b',
	italic: 'i',
	underline: 'u',
	strikethrough: 's',
	code: 'c'
}

const FLAG_TO_STYLE: Record<string, string> = Object.fromEntries(
	Object.entries(STYLE_FLAG_MAP).map(([k, v]) => [v, k])
)

export function encodeStyleFlags(styles: Record<string, unknown>): string {
	let flags = ''
	for (const [style, flag] of Object.entries(STYLE_FLAG_MAP)) {
		if (styles[style]) flags += flag
	}
	return flags
}

export function decodeStyleFlags(flags: string): Record<string, unknown> {
	const styles: Record<string, unknown> = {}
	for (const ch of flags) {
		const style = FLAG_TO_STYLE[ch]
		if (style) styles[style] = true
	}
	return styles
}

// ── Block type compaction ──

export function compactBlockType(t: string): string {
	return BLOCK_TYPE_TO_SHORT.get(t) ?? t
}

/**
 * Long name for a stored `t`, which may already be either spelling.
 *
 * `t` is a free-form stored string, so the lookup has to survive `'toString'` and
 * `'__proto__'` arriving as block types. `BLOCK_TYPE_TO_LONG` is a `Map`, which has
 * no prototype chain to fall through, so this is a plain lookup again.
 */
export function siteBlockType(t: string): string {
	return BLOCK_TYPE_TO_LONG.get(t) ?? t
}

/** The editor's name for the same lookup — one function, two call sites' vocabulary. */
export const expandBlockType = siteBlockType

// ── Inline content compaction ──

export function compactContentItem(item: InlineContent): CompactInlineContent {
	if (item.type === 'text') {
		const styles = item.styles
		const boolFlags = encodeStyleFlags(styles ?? {})
		const hasColor = styles?.textColor || styles?.backgroundColor

		if (!boolFlags && !hasColor) {
			// Plain unstyled text → bare string
			return item.text
		}

		if (hasColor) {
			// Styled text with colors → [text, flags, {tc, bg}]
			const colors: CompactColorStyles = {}
			if (styles.textColor) colors.tc = styles.textColor
			if (styles.backgroundColor) colors.bg = styles.backgroundColor
			return [item.text, boolFlags, colors]
		}

		// Styled text with boolean flags only → [text, flags]
		return [item.text, boolFlags]
	}

	if (item.type === 'link') {
		return {
			l: item.href,
			c: item.content.map(compactContentItem)
		}
	}

	if (item.type === 'wikiLink') {
		return { wl: item.props.pageId, wt: item.props.pageTitle }
	}

	if (item.type === 'tag') {
		return { tg: item.props.tag }
	}

	// Unreachable against the declared union, and reached anyway if BlockNote hands
	// back an inline spec this build has no branch for. Passed through rather than
	// blanked, so a round trip through the editor cannot delete stored content.
	return asBlockContent(item)
}

/**
 * One stored inline run, in the verbose form BlockNote reads.
 *
 * `unknown` in, because that is what a stored run is: the decode below is the only
 * thing that says otherwise. A pre-compact item is normalized first rather than
 * branched on again here, so the legacy shapes are described once
 * (`normalizeSiteInline`) instead of twice.
 */
export function expandContentItem(raw: unknown): InlineContent {
	const item = normalizeSiteInline(raw)
	const decoded = decodeSiteInline(item)
	if (decoded === undefined) {
		// Something newer than this build knows. Handed back untouched rather than
		// blanked: the editor round-trips content through here, and replacing an
		// unreadable run with an empty one would write that loss back to the store.
		return asBlockContent(item)
	}

	// Bare string → unstyled text
	if (typeof decoded === 'string') return { type: 'text', text: decoded, styles: {} }

	// Tuple → styled text
	if (Array.isArray(decoded)) {
		const [text, flags, colors] = decoded
		const styles: Record<string, unknown> = decodeStyleFlags(flags)
		if (colors?.tc) styles.textColor = colors.tc
		if (colors?.bg) styles.backgroundColor = colors.bg
		return { type: 'text', text, styles }
	}

	if ('l' in decoded) {
		// `asBlockContent`: `Link.content` is `StyledText[]`, which cannot express a
		// wiki link or a tag nested inside a link — a BlockNote schema limit, not a
		// question about what the data is.
		return {
			type: 'link',
			href: decoded.l,
			content: asBlockContent(decoded.c.map(expandContentItem))
		}
	}
	if ('wl' in decoded) {
		return { type: 'wikiLink', props: { pageId: decoded.wl, pageTitle: decoded.wt } }
	}
	return { type: 'tag', props: { tag: decoded.tg } }
}

// ── Legacy inline content normalization ──
//
// `expandContentItem` above hands a pre-compact item straight back to BlockNote,
// which understands it. The publisher has no BlockNote, so it needs the same
// backward-compat branch resolved the other way: legacy in, compact out.

function legacyColors(styles: Record<string, unknown> | undefined): CompactColorStyles | undefined {
	const colors: CompactColorStyles = {}
	// `default` is BlockNote for "the theme decides" — not a colour, so not carried.
	if (typeof styles?.textColor === 'string' && styles.textColor !== 'default') {
		colors.tc = styles.textColor
	}
	if (typeof styles?.backgroundColor === 'string' && styles.backgroundColor !== 'default') {
		colors.bg = styles.backgroundColor
	}
	return colors.tc || colors.bg ? colors : undefined
}

/**
 * One inline item in the compact form, converting a legacy verbose one on the way.
 *
 * `tLegacyInline` is decoded **to detect only**: anything that is not one of the four
 * pre-compact shapes — already compact, or newer than this build — is returned as the
 * very object that came in, not a rebuilt copy. `T.struct` decodes into a fresh `{}`,
 * so returning the decode's output would break identity for every already-compact
 * item, and callers rely on being able to hand every item through here unconditionally.
 *
 * The result is `unknown` because that is what it is worth: the caller decodes it
 * against `tSiteInline`, which is what turns "probably compact" into a checked shape.
 */
export function normalizeSiteInline(item: unknown): unknown {
	const legacy = decodeLegacyInline(item)
	if (legacy === undefined) return item

	if (legacy.type === 'text') {
		const styles = legacy.styles
		const flags = encodeStyleFlags(styles ?? {})
		const colors = legacyColors(styles)
		const text = legacy.text ?? ''
		if (colors) return [text, flags, colors]
		return flags ? [text, flags] : text
	}

	if (legacy.type === 'link') {
		return { l: legacy.href ?? '', c: (legacy.content ?? []).map(normalizeSiteInline) }
	}

	if (legacy.type === 'wikiLink') {
		return { wl: legacy.props?.pageId ?? '', wt: legacy.props?.pageTitle ?? '' }
	}

	return { tg: legacy.props?.tag ?? '' }
}

export function compactContent(
	content: InlineContent[] | undefined
): CompactInlineContent[] | undefined {
	if (!content || !Array.isArray(content) || content.length === 0) return undefined
	return content.map(compactContentItem)
}

// ── Table content compaction/expansion ──

function compactTableCells(
	cells: InlineContent[][] | TableCell[]
): CompactInlineContent[][] | CompactTableCell[] {
	if (isTableCellArray(cells)) {
		return cells.map((tc): CompactTableCell => {
			const pr = cleanProps(tc.props)
			return {
				...(pr !== undefined && { pr }),
				c: tc.content.map(compactContentItem)
			}
		})
	}
	// InlineContent[][] — each cell is InlineContent[]
	return cells.map((cell) => cell.map(compactContentItem))
}

/**
 * One cell, whichever of the three spellings it is in.
 *
 * Only the fallback in `expandTableCells` needs this: the two whole-row predicates above it
 * cover the uniform cases. A row written across a format change is uniform in neither, and
 * mapping it wholesale is what threw a `TypeError` out of `fromStoredBlock` and cost the
 * reader the whole page — the degradation `decodeStoredBlock` promises is per record.
 */
function expandTableCell(cell: unknown): InlineContent[] | TableCell {
	if (Array.isArray(cell)) return (cell as CompactInlineContent[]).map(expandContentItem)
	if (Array.isArray((cell as CompactTableCell)?.c)) {
		const tc = cell as CompactTableCell
		return { type: 'tableCell', props: tc.pr ?? {}, content: tc.c.map(expandContentItem) }
	}
	if (Array.isArray((cell as TableCell)?.content)) {
		const tc = cell as TableCell
		return {
			type: 'tableCell',
			props: tc.props ?? {},
			content: tc.content.map(expandContentItem)
		}
	}
	// Unreadable: an empty cell, never a thrown page.
	return []
}

/**
 * The compact spelling is what every write produces, so it is tried first. The
 * verbose one is a read path only — a block written before content compaction —
 * and nothing emits it any more.
 */
function expandTableCells(
	cells: CompactInlineContent[][] | CompactTableCell[]
): InlineContent[][] | TableCell[] {
	if (isCompactTableCellArray(cells)) {
		return cells.map(
			(tc): TableCell => ({
				type: 'tableCell',
				props: tc.pr ?? {},
				content: tc.c.map(expandContentItem)
			})
		)
	}
	// Already what BlockNote wants, so only the runs inside need expanding — the fast
	// path for a whole row in the verbose spelling.
	if (isTableCellArray(cells as unknown as InlineContent[][] | TableCell[])) {
		return (cells as unknown as TableCell[]).map(
			(tc): TableCell => ({
				type: 'tableCell',
				props: tc.props ?? {},
				content: tc.content.map(expandContentItem)
			})
		)
	}
	// A row in no single spelling — see `expandTableCell`. Covers the uniform
	// `CompactInlineContent[][]` case too, which is what it costs to be per-cell here.
	return cells.map(expandTableCell) as InlineContent[][] | TableCell[]
}

export function compactTableContent(content: TableContent): CompactTableContent {
	return {
		type: 'tableContent',
		...(content.columnWidths?.length && { cw: content.columnWidths }),
		...(content.headerRows && { hr: content.headerRows }),
		...(content.headerCols && { hc: content.headerCols }),
		rows: content.rows.map((row) => ({
			cells: compactTableCells(row.cells)
		}))
	}
}

/**
 * A stored table in the verbose form BlockNote reads.
 *
 * Both spellings on the way in, like `expandTableCells` above it: a block not
 * retyped since content compaction still carries BlockNote's own `columnWidths`/
 * `headerRows`/`headerCols`, and reading only `cw`/`hr`/`hc` dropped them — after
 * which the next edit wrote that loss back. Compact first, because that is what
 * every write produces.
 */
export function expandTableContent(content: CompactTableContent | TableContent): TableContent {
	const legacy = content as Partial<TableContent>
	const compact = content as Partial<CompactTableContent>
	const columnWidths = compact.cw ?? legacy.columnWidths ?? []
	const headerRows = compact.hr ?? legacy.headerRows
	const headerCols = compact.hc ?? legacy.headerCols
	return {
		type: 'tableContent',
		columnWidths,
		...(headerRows && { headerRows }),
		...(headerCols && { headerCols }),
		// The verbose cell spellings are a runtime branch inside `expandTableCells`,
		// not part of its parameter type — narrow here rather than widen there.
		rows: content.rows.map((row) => ({
			cells: expandTableCells(row.cells as CompactInlineContent[][] | CompactTableCell[])
		}))
	}
}

// ── Polymorphic content compaction (handles both inline and table content) ──

export function compactBlockContent(
	content: InlineContent[] | TableContent | undefined
): CompactInlineContent[] | CompactTableContent | undefined {
	if (!content) return undefined
	if (isTableContent(content)) return compactTableContent(content)
	if (Array.isArray(content) && content.length > 0) return content.map(compactContentItem)
	return undefined
}

/** `unknown` in: a stored block's `c` is whatever the document holds. */
export function expandBlockContent(content: unknown): InlineContent[] | TableContent | undefined {
	if (!content) return undefined
	if (isCompactTableContent(content)) return expandTableContent(content)
	if (Array.isArray(content) && content.length > 0) return content.map(expandContentItem)
	return undefined
}

// ── Sanitization helpers ──

export function cleanProps(
	props: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
	if (!props) return undefined
	const cleaned: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(props)) {
		if (value === 'default') continue
		if (key === 'textAlignment' && value === 'left') continue
		cleaned[key] = value
	}
	return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

// ── Block transformers ──

export function fromStoredBlock(stored: StoredBlockRecord, ownerTag?: string): BlockRecord {
	return {
		pageId: stored.p,
		type: expandBlockType(stored.t),
		...(stored.pr !== undefined && { props: stored.pr }),
		...(stored.c !== undefined && { content: expandBlockContent(stored.c) }),
		...(stored.pb !== undefined && { parentBlockId: stored.pb }),
		order: stored.o,
		updatedAt: stored.ua,
		updatedBy: stored.ub ?? ownerTag ?? ''
	}
}

export function toStoredBlock(block: BlockRecord, ownerTag?: string): StoredBlockRecord {
	const pr = cleanProps(block.props)
	const c = compactBlockContent(block.content)
	return {
		p: block.pageId,
		t: compactBlockType(block.type),
		...(pr !== undefined && { pr }),
		...(c !== undefined && { c }),
		...(block.parentBlockId != null && { pb: block.parentBlockId }),
		o: block.order,
		ua: block.updatedAt,
		...(block.updatedBy !== ownerTag && { ub: block.updatedBy })
	}
}

// ── Page transformers ──

export function fromStoredPage(stored: StoredPageRecord): PageRecord {
	return {
		title: stored.ti,
		...(stored.ic !== undefined && { icon: stored.ic }),
		...(stored.pp !== undefined && { parentPageId: stored.pp }),
		order: stored.o,
		// Only when present: a projected read (`useAllPages`) does not fetch these,
		// and materialising `undefined` keys would hide that from callers.
		...(stored.ca !== undefined && { createdAt: stored.ca }),
		...(stored.ua !== undefined && { updatedAt: stored.ua }),
		...(stored.cb !== undefined && { createdBy: stored.cb }),
		...(stored.tg !== undefined && { tags: stored.tg }),
		// Site fields: absent stays absent, so a projected read stays distinguishable
		// from a page that genuinely has no slug and no archetype.
		...(stored.slug !== undefined && { slug: stored.slug }),
		...(stored.draft !== undefined && { draft: stored.draft }),
		...(stored.kind !== undefined && { kind: stored.kind }),
		...(stored.childKind !== undefined && { childKind: stored.childKind }),
		...(stored.author !== undefined && { author: stored.author }),
		...(stored.pubAt !== undefined && { publishedAt: stored.pubAt }),
		...(stored.desc !== undefined && { desc: stored.desc }),
		...(stored.image !== undefined && { image: stored.image }),
		...(stored.noNav !== undefined && { noNav: stored.noNav })
	}
}

export function toStoredPage(page: FullPageRecord): StoredPageRecord {
	return {
		ti: page.title,
		...(page.icon !== undefined && { ic: page.icon }),
		...(page.parentPageId !== undefined && { pp: page.parentPageId }),
		o: page.order,
		ca: page.createdAt,
		ua: page.updatedAt,
		cb: page.createdBy,
		...(page.tags !== undefined && { tg: page.tags }),
		...(page.slug !== undefined && { slug: page.slug }),
		...(page.draft !== undefined && { draft: page.draft }),
		...(page.kind !== undefined && { kind: page.kind }),
		...(page.childKind !== undefined && { childKind: page.childKind }),
		...(page.author !== undefined && { author: page.author }),
		...(page.publishedAt !== undefined && { pubAt: page.publishedAt }),
		...(page.desc !== undefined && { desc: page.desc }),
		...(page.image !== undefined && { image: page.image }),
		...(page.noNav !== undefined && { noNav: page.noNav })
	}
}

// vim: ts=4
