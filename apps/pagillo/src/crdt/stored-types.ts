// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Stored (Y.Doc) shapes of a publication. All lengths are Fx — integer 1/1024 pt, the engine's
 * unit; the UI converts at the input. Type-only imports: worker-safe.
 *
 * Every `f`/`ms`/`s`/`st` value is a `Y.Map` of fields and atomic field groups (`entities.ts`
 * holds the key layout, readers and writers); the `Stored*` entity types below are the plain
 * **read** shapes those readers return.
 */

import type * as Y from 'yjs'
import type {
	ImageFrameData,
	InlineEmbed,
	Marks,
	Master,
	MasterVariant,
	ParagraphProps,
	Section,
	ShapeFrameData,
	StyleDef
} from '@cloudillo/typeset'

/**
 * `st` value: `{ k: 'p'|'c', name, basedOn?: styleId, props }` (engine `StyleDef`). Stored as
 * keys `k`, `name`, `basedOn` and `p/<prop>` per property.
 */
export type StoredStyle = StyleDef

/** A master's per-side override as stored: no `items` (items are frame-owned). */
export type StoredMasterVariant = Omit<MasterVariant, 'items'>

/**
 * `ms` value: engine `Master` without `id` and `items`, plus a display name ("Page layout" in
 * the UI) and pagillo-only layout fields (`masterToEngine` strips them): `rows`/`rowGutter` = row
 * grid; `side` = facing-page handling (missing: 'different' with variants, else 'mirror');
 * `flow` = region order (missing: 'auto'); `leftOrder` = manual left-page order (region ids,
 * mirrored); `regionNames` = region id → display name. Stored as keys `name` + one atomic
 * `layout` (everything else). Static items are frames anchored `{ ms: masterId, side? }`.
 */
export type StoredMaster = Omit<Master, 'id' | 'items' | 'left' | 'right'> & {
	left?: StoredMasterVariant
	right?: StoredMasterVariant
	name: string
	rows?: number
	rowGutter?: number
	side?: 'mirror' | 'same' | 'different'
	flow?: 'auto' | 'manual'
	leftOrder?: string[]
	regionNames?: Record<string, string>
}

/** `s` value: `story` is a `tx` key; `maxPages` caps page creation. */
export type StoredSection = Omit<Section, 'id' | 'story'> & { story: string }

/**
 * `img` frame data (read shape, flat): no `fileId` = empty template frame; `deco` = decorative;
 * `px` = the image's pixel size, recorded at pick time (dpi preflight, "Size frame to image").
 * Stored grouped: `fileId`/`px`/`crop` are one atomic `src` key (absent = empty frame).
 */
export type StoredImageData = ImageFrameData & { px?: [number, number] }

/**
 * `txt` frame data. A chain **head** has `story` (a `tx` key) and optionally `chain`, the
 * follower frame ids in flow order. A **follower** stores `{}`: no `story`, no `chain`.
 */
export interface StoredTextFrameData {
	story?: string
	chain?: string[]
	inset?: number
	fill?: string
	stroke?: string
	strokeW?: number
}

/** Box styling of a text frame, without the story/chain linkage. */
export function textBox(d: StoredTextFrameData): Omit<StoredTextFrameData, 'story' | 'chain'> {
	const { story: _s, chain: _c, ...box } = d
	return box
}

export type StoredShapeData = ShapeFrameData

/** `emb` frame data: an opaque embed record. */
export type StoredEmbedData = Record<string, unknown>

/** Page frame: section id + page index within it. */
export interface PageAnchor {
	sec: string
	page: number
}

/** Master static item: master id; `side` 'l'/'r' = that page side only, absent = both sides. */
export interface MasterAnchor {
	ms: string
	side?: 'l' | 'r'
}

/**
 * `f` value (read shape, `readFrame`): page-anchored frame or master static item. Stored
 * flattened: `t`, `anchor`, `geo` = `{ x, y, w, h, rot }`, `z`, `wrap`, and the `data` fields
 * as their own keys (`img`: `src` group; `emb`: one `emb` key).
 */
export interface StoredFrame {
	t: 'img' | 'emb' | 'txt' | 'shp'
	anchor: PageAnchor | MasterAnchor
	x: number
	y: number
	w: number
	h: number
	rot: number
	z: number
	wrap: { mode: 'none' | 'box' | 'tb'; off: number }
	data: StoredImageData | StoredTextFrameData | StoredShapeData | StoredEmbedData
}

/** `ln` value: reserved for linked content; shape not defined yet. */
export type StoredLink = Record<string, unknown>

/** Default block type → paragraph style id (`m.styleMap`). */
export type StyleMapKey =
	| 'p'
	| 'h1'
	| 'h2'
	| 'h3'
	| 'h4'
	| 'h5'
	| 'h6'
	| 'quote'
	| 'code'
	| 'caption'
export type StyleMap = Partial<Record<StyleMapKey, string>>

/**
 * Keys of the `m` map (each its own entry, so concurrent edits of different keys merge).
 * `page` = default page size; `engine` = `ENGINE_VERSION` semver; `fonts` = font hashes;
 * `pdf` = last export options; `exportedAt` = ISO date written by export.
 */
export interface StoredMeta {
	title?: string
	page?: { w: number; h: number }
	facing?: boolean
	engine?: string
	fonts?: Record<string, string>
	pdf?: Record<string, unknown>
	lang?: string
	styleMap?: StyleMap
	exportedAt?: string
	spellIgnore?: string[]
}

/**
 * Story `Y.Text` encoding (Quill Delta conventions).
 * Inline marks on characters: engine `Marks` (bold, italic, underline, strike, color, font,
 * size [Fx], link, cs [char style id]).
 * Line attributes on each `'\n'`:
 */
export interface StoredLineAttrs {
	/** Stable block id, unique within the story (`normalize.ts`). */
	bid?: string
	/** Paragraph style id. */
	ps?: string
	/** Direct paragraph overrides. */
	po?: Partial<ParagraphProps>
	/** Quill list toggle; level comes from `indent`. */
	list?: 'bullet' | 'ordered'
	indent?: number
	/** Template ghost prompt, drawn only while the paragraph is empty. */
	ph?: string
	/** Heading nudge dismissed for this paragraph. */
	nh?: 1
}

/** Every inline mark key (`Marks`) and `'\n'` line attr key (`StoredLineAttrs`). */
export const MARK_KEYS = [
	'bold',
	'italic',
	'underline',
	'strike',
	'color',
	'font',
	'size',
	'link',
	'cs'
] as const satisfies readonly (keyof Marks)[]
export const LINE_KEYS = [
	'bid',
	'ps',
	'po',
	'list',
	'indent',
	'ph',
	'nh'
] as const satisfies readonly (keyof StoredLineAttrs)[]

export type StoredMarks = Marks

/** Length-1 embed inserts: `{ img }`, `{ emb }`, `{ fn }`, `{ field }`, `{ toc }`. */
export type StoredInlineEmbed = InlineEmbed

/**
 * Typed root handles returned by `openPublication`. Entity roots hold one `Y.Map` per entity;
 * read them through `entities.ts` (a peer may have stored anything there). `m` collections
 * `fonts`, `styleMap`, `spellIgnore` (word → 1) are flat `<name>/<entry>` keys (`setMeta` /
 * `readMeta`).
 */
export interface YPagilloDocument {
	m: Y.Map<unknown>
	st: Y.Map<Y.Map<unknown>>
	ms: Y.Map<Y.Map<unknown>>
	secs: Y.Array<string>
	s: Y.Map<Y.Map<unknown>>
	tx: Y.Map<Y.Text>
	ln: Y.Map<Y.Map<unknown>>
	f: Y.Map<Y.Map<unknown>>
}

// vim: ts=4
