// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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

export type CompactInlineContent =
	| string // unstyled text
	| [string, string] // [text, styleFlags]
	| [string, string, CompactColorStyles] // [text, styleFlags, colors]
	| CompactLink // link
	| CompactWikiLink // wikiLink
	| CompactTag // tag

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

export function isTableContent(content: unknown): content is TableContent {
	return (
		typeof content === 'object' &&
		content !== null &&
		(content as TableContent).type === 'tableContent'
	)
}

// ── Block type short/long mappings ──

export const BLOCK_TYPE_TO_SHORT: Record<string, string> = {
	paragraph: 'p',
	heading: 'h',
	bulletListItem: 'ul',
	numberedListItem: 'ol',
	checkListItem: 'cl',
	table: 'tb',
	image: 'img',
	video: 'vid',
	audio: 'aud',
	file: 'f',
	codeBlock: 'code'
}

export const BLOCK_TYPE_TO_LONG: Record<string, string> = Object.fromEntries(
	Object.entries(BLOCK_TYPE_TO_SHORT).map(([k, v]) => [v, k])
)

// ── Stored types (compact, for RTDB wire/storage) ──

export interface StoredPageRecord {
	ti: string // title
	ic?: string // icon
	ci?: string // coverImage
	pp?: string // parentPageId ('__root__' = root, pageId = child, absent = orphan)
	hc?: boolean // hasChildren (true = has child pages)
	ae?: boolean // autoExpand on load
	o: number // order
	ca: string // createdAt
	ua: string // updatedAt
	cb: string // createdBy
	tg?: string[] // tags (sorted, deduplicated)
}

export interface StoredBlockRecord {
	p: string // pageId
	t: string // type (short code or full name)
	pr?: Record<string, unknown> // props
	c?: CompactInlineContent[] | CompactTableContent // content (compact format)
	pb?: string | null // parentBlockId (null = root)
	o: number // order
	ua: string // updatedAt
	ub?: string // updatedBy (omitted when owner is the updater)
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
	coverImage?: string
	parentPageId?: string // '__root__' = root, pageId = child, absent = orphan
	hasChildren?: boolean
	autoExpand?: boolean
	order: number
	createdAt: string
	updatedAt: string
	createdBy: string
	tags?: string[]
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

// ── Settings (singleton document) ──

export interface Settings {
	title: string
	defaultPage?: string
	theme?: string
}

// vim: ts=4
