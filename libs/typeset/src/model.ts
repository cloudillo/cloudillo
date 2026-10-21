// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Engine document model: plain objects, no Yjs.
// All lengths are Fx (1/1024 pt, integer) unless noted otherwise.

import type { Fx } from './fixed.js'

export type Align = 'left' | 'right' | 'center' | 'justify'

export interface ListProps {
	kind: 'bullet' | 'ordered'
	/**
	 * Bullet: the marker text (empty = '•'). Ordered: the first `1`/`a`/`A`/`i`/`I` is the
	 * counter (decimal/alphabetic/roman), the rest literal, e.g. `'1.'`, `'(a)'` (empty = `'1.'`).
	 */
	format: string
	/** 0-based nesting level (0–8); each level indents by one list step. */
	level: number
}

export interface ParagraphProps {
	font: string
	size: Fx
	leading: Fx
	spaceBefore: Fx
	spaceAfter: Fx
	indentStart: Fx
	indentEnd: Fx
	indentFirst: Fx
	align: Align
	hyphenate: boolean
	lang: string
	/** Keep in the same column as the start of the next paragraph. */
	keepNext: boolean
	/** Never split across columns (unless taller than a column). */
	keepTogether: boolean
	/** Minimum lines of a split paragraph at the top of a column. */
	widows: number
	/** Minimum lines of a split paragraph at the bottom of a column. */
	orphans: number
	/** Start in a new column / on a new page (no-op at the top of one). */
	breakBefore: 'none' | 'column' | 'page'
	spanColumns: boolean
	/** Drop cap height in lines; 0 = none. */
	dropCap: number
	list?: ListProps
	/** 1–6 → heading level (H1–H6 tag, TOC entry). */
	tocLevel?: number
}

export interface CharProps {
	font: string
	weight: number
	italic: boolean
	size: Fx
	color: string
	underline: boolean
	strike: boolean
	/** Letter spacing in 1/1000 em. */
	tracking: number
	baselineShift: Fx
}

export type StyleDef =
	| { k: 'p'; name: string; basedOn?: string; props: Partial<ParagraphProps & CharProps> }
	| { k: 'c'; name: string; basedOn?: string; props: Partial<CharProps> }

export interface Margins {
	t: Fx
	b: Fx
	/** Binding side: left on a right-hand or non-facing page, right on a left-hand page. */
	in: Fx
	out: Fx
}

/** A flow region in page space; split into `cols` equal columns separated by `gutter`. */
export interface Region {
	id: string
	x: Fx
	y: Fx
	w: Fx
	h: Fx
	cols: number
	gutter: Fx
}

export interface Master {
	id: string
	w: Fx
	h: Fx
	margins: Margins
	cols: number
	gutter: Fx
	/** Flow order. Empty = one region inside the margins, split into `cols` columns. */
	regions: Region[]
	/** Static frame ids drawn on every page using this master. */
	items: string[]
	/** Overrides on left-hand pages (facing publications only). */
	left?: MasterVariant
	/** Overrides on right-hand pages (facing publications only). */
	right?: MasterVariant
}

/** Per-side master override; an absent field falls back to the master's own. */
export interface MasterVariant {
	margins?: Margins
	cols?: number
	gutter?: Fx
	regions?: Region[]
	items?: string[]
}

export interface Section {
	id: string
	story: Story
	first: string
	rest: string
	start: 'any' | 'odd' | 'even'
	/**
	 * Page numbers: `restart` = this section's first page is 1, else numbering continues from the
	 * previous page; `format` as `ListProps.format` for ordered lists (absent/empty = `'1'`).
	 */
	pageNum?: { restart: boolean; format: string }
	/** Cap on created pages; overflow becomes overset. */
	maxPages?: number
}

export interface Box {
	x: Fx
	y: Fx
	w: Fx
	h: Fx
}

/** Source-image crop as fractions (0–1) of the image; render-only, never affects layout. */
export interface Crop {
	x: number
	y: number
	w: number
	h: number
}

export interface ImageFrameData {
	/** Absent = empty template frame (no `image` item is emitted). */
	fileId?: string
	crop: Crop
	fit: 'fill' | 'contain' | 'cover'
	alt: string
	/** Decorative → Artifact tag. */
	deco?: boolean
}

/**
 * A text box. A **head** has its own short story, laid out inside the frame box, then on through
 * the `chain` frames' boxes in order (one flow; what is left over is overset). A **follower** — a
 * `txt` frame listed in some head's `chain` — has `{}`: no story, no chain.
 * Only page-anchored frames thread (never master items); the engine drops invalid `chain` ids
 * (not a `txt` follower, a master item, or claimed by a lower head id).
 */
export interface TextFrameData {
	/** Head (or standalone) only. */
	story?: Story
	/** Head only: follower frame ids, in flow order. */
	chain?: string[]
	/** Inner margin on every side: text flows in the box shrunk by it. */
	inset?: Fx
	/** Background. */
	fill?: string
	/** Border, drawn inside the box. */
	stroke?: string
	strokeW?: Fx
}

export interface ShapeFrameData {
	kind: 'rect' | 'ellipse'
	fill?: string
	stroke?: string
	strokeW?: Fx
}

/**
 * A page-anchored frame (page space). `wrap` excludes its outline (box, rotated box or ellipse)
 * grown by `off` from the story's lines: `box` = lines take every free part of the column (≥ 2 em),
 * `tb` = the whole band is skipped.
 */
export interface Frame {
	id: string
	t: 'img' | 'emb' | 'txt' | 'shp'
	/** Section id and page index within the section; the page is kept alive (up to `maxPages`). */
	anchor: { sec: string; page: number }
	x: Fx
	y: Fx
	w: Fx
	h: Fx
	/** Degrees clockwise about the box centre; the render transform, and wrap follows it. */
	rot: number
	/** Paint order on the page; `z < 0` paints below the story text, `z >= 0` above it. */
	z: number
	wrap: { mode: 'none' | 'box' | 'tb'; off: Fx }
	/**
	 * `ImageFrameData` for `img`, `TextFrameData` for `txt`, `ShapeFrameData` for `shp`; embed
	 * record for `emb`.
	 */
	data: ImageFrameData | TextFrameData | ShapeFrameData | Record<string, unknown>
}

export interface Marks {
	bold?: boolean
	italic?: boolean
	underline?: boolean
	strike?: boolean
	color?: string
	font?: string
	size?: Fx
	link?: string
	/** Character style id. */
	cs?: string
}

export type InlineEmbed =
	/** `float`: line-start float, copied to `EmbedBlock.float` by the adapter. */
	| { img: { fileId: string; w: Fx; h: Fx; alt: string; float?: { side: 'l' | 'r'; w: number } } }
	| { emb: Record<string, unknown> }
	| { fn: string /* footnote story id */ }
	/** Page number, publication page count, section title (`tocLevel` heading), `Publication.title`. */
	| { field: 'page' | 'pages' | 'section' | 'title' }
	| { field: 'date'; src: 'fixed' | 'export'; d?: string /* YYYY-MM-DD */ }
	| { toc: { levels: number } }

/** A text run; an inline embed is a run whose `text` is U+FFFC with `embed` set. */
export interface Run {
	text: string
	marks: Marks
	embed?: InlineEmbed
}

export interface TableCell {
	paragraphs: Paragraph[]
	colSpan?: number
	rowSpan?: number
}

export interface TableRow {
	cells: TableCell[]
	header?: boolean
}

export interface TableBlock {
	k: 'table'
	/**
	 * Relative column widths, scaled to the column the table sits in; equal widths when one is
	 * missing or not positive.
	 */
	cols: Fx[]
	rows: TableRow[]
	/** Rules: every cell edge (default), the outer box, a line below the header rows, none. */
	borders?: 'all' | 'outer' | 'header' | 'none'
}

/**
 * An inline (paragraph-level) image or embed: never split, scaled down to the free column width
 * (aspect kept) and centred, the caption below it in the paragraph's style.
 */
export interface EmbedBlock {
	k: 'emb'
	/** Embed record; unused when `img` is set. */
	data: Record<string, unknown>
	/** Set = an inline image (no `fileId` = empty: space kept, nothing painted). */
	img?: ImageFrameData
	/** Natural size. */
	w: Fx
	h: Fx
	/** Plain caption text; not part of the story's text offsets. */
	caption?: string
	/**
	 * Line-start float: `w` of the column wide (a fraction, e.g. 0.5 or 0.333), at the
	 * column's `side`, its top where the flow reaches it; following text in the column wraps beside it.
	 */
	float?: { side: 'l' | 'r'; w: number }
}

export interface Paragraph {
	bid: string
	/** Paragraph style id. */
	style: string
	overrides: Partial<ParagraphProps>
	runs: Run[] | TableBlock | EmbedBlock
	/** Template ghost prompt, shown only while the paragraph is empty. */
	placeholder?: string
}

export interface Story {
	id: string
	paragraphs: Paragraph[]
}

export interface Publication {
	/** Publication language for all locale formatting. */
	lang: string
	styles: Record<string, StyleDef>
	masters: Record<string, Master>
	/** Flow order. */
	sections: Section[]
	/**
	 * Page-anchored frames, and the static items of masters (`Master.items` ids; their `anchor`
	 * is ignored, they are drawn on every page using the master).
	 */
	frames: Record<string, Frame>
	/** Facing pages: global page 1 is right-hand, sides alternate, master variants apply. */
	facing: boolean
	/** Printed by the `title` field. */
	title?: string
	/** ISO date written by export; printed by date fields with `src: 'export'` (empty if absent). */
	exportedAt?: string
	/**
	 * Footnote body stories by story id (= the `{ fn }` embed id). Laid out at the bottom of the
	 * column of their ref, in section flows only.
	 */
	footnotes?: Record<string, Story>
}
