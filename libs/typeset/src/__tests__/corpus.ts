// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Shared test corpus + node font loading. Not a test file (testMatch is `*.test.ts`).

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { PageDL } from '../display-list.js'
import { type Fx, ptToFx } from '../fixed.js'
import { type FetchBytes, glyphPath } from '../fonts/loader.js'
import { FontRegistry } from '../fonts/registry.js'
import { layoutStory } from '../layout/index.js'
import type {
	Box,
	Frame,
	InlineEmbed,
	Master,
	Paragraph,
	Publication,
	Run,
	StyleDef,
	Story,
	TableBlock,
	TableCell,
	TextFrameData
} from '../model.js'
import { createShapeCache } from '../shape/cache.js'
import { initHarfBuzz } from '../shape/hb.js'
import { type ItemizeEnv, loadParagraphFaces } from '../text/itemize.js'

export { glyphPath }

/** `libs/fonts/fonts`, resolved from this file (jest's cwd is `libs/typeset`, but don't rely on it). */
const FONTS_DIR = fileURLToPath(new URL('../../../fonts/fonts', import.meta.url))

/** Node `FetchBytes`: `/fonts/<dir>/<File>.ttf` → bytes from `libs/fonts/fonts`. */
export const fetchBytes: FetchBytes = async (url) => {
	const buf = await readFile(FONTS_DIR + url.slice('/fonts'.length))
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export const SHY = String.fromCharCode(0xad)

export const STYLES: Record<string, StyleDef> = {
	body: {
		k: 'p',
		name: 'Body',
		props: {
			font: 'Lato',
			size: ptToFx(11),
			align: 'justify',
			hyphenate: true,
			spaceAfter: ptToFx(4)
		}
	},
	left: { k: 'p', name: 'Left', basedOn: 'body', props: { align: 'left', hyphenate: false } },
	h1: {
		k: 'p',
		name: 'Heading 1',
		basedOn: 'body',
		props: {
			size: ptToFx(20),
			weight: 700,
			align: 'left',
			hyphenate: false,
			tocLevel: 1,
			spaceBefore: ptToFx(12),
			spaceAfter: ptToFx(6)
		}
	},
	h2: {
		k: 'p',
		name: 'Heading 2',
		basedOn: 'h1',
		props: { size: ptToFx(14), tocLevel: 2, spaceBefore: ptToFx(8) }
	},
	center: {
		k: 'p',
		name: 'Center',
		basedOn: 'left',
		props: { align: 'center', font: 'Noto Sans' }
	}
}

let bidN = 0
export function p(style: string, ...runs: (string | Run)[]): Paragraph {
	return {
		bid: `b${++bidN}`,
		style,
		overrides: {},
		runs: runs.map((r) => (typeof r === 'string' ? { text: r, marks: {} } : r))
	}
}

/** A table paragraph; a string cell is one `left` paragraph; the first `header` rows are headers. */
export function table(
	rows: (string | TableCell)[][],
	opts: { header?: number; cols?: Fx[]; borders?: TableBlock['borders'] } = {}
): Paragraph {
	return {
		bid: `b${++bidN}`,
		style: 'left',
		overrides: {},
		runs: {
			k: 'table',
			cols: opts.cols ?? [],
			rows: rows.map((cells, r) => ({
				cells: cells.map((c) =>
					typeof c === 'string' ? { paragraphs: [p('left', c)] } : c
				),
				...(r < (opts.header ?? 0) ? { header: true } : {})
			})),
			...(opts.borders ? { borders: opts.borders } : {})
		}
	}
}

export const EN =
	'Typesetting is the composition of text by means of arranging physical types or their digital equivalents. ' +
	'Stored letters and other symbols are retrieved and ordered according to a language’s orthography for visual display.'
export const HU =
	'Árvíztűrő tükörfúrógép. A könyvnyomtatás története a mozgatható betűk feltalálásával kezdődött; ' +
	'a szövegszedés évszázadokon át kézművesség maradt, amíg a gépi szedés meg nem jelent.'
export const DE =
	'Die Donaudampfschifffahrtsgesellschaft beförderte Fahrgäste. Silbentrennung verbessert den Blocksatz ' +
	'in schmalen Spalten erheblich, besonders bei zusammengesetzten Hauptwörtern.'

export interface Case {
	name: string
	story: Story
	lang: string
	region: Box
	page: { w: Fx; h: Fx }
}

const A5 = { w: ptToFx(420), h: ptToFx(595) }
const box = (x: number, y: number, w: number, h: number): Box => ({
	x: ptToFx(x),
	y: ptToFx(y),
	w: ptToFx(w),
	h: ptToFx(h)
})

export const CORPUS: Case[] = [
	{
		name: 'en-headings-justify',
		lang: 'en',
		page: A5,
		region: box(36, 36, 348, 523),
		story: {
			id: 's-en',
			paragraphs: [
				p('h1', 'Typesetting'),
				p('body', EN),
				p('h2', 'Marks'),
				p(
					'left',
					'Plain, ',
					{ text: 'bold', marks: { bold: true } },
					', ',
					{ text: 'italic', marks: { italic: true } },
					', ',
					{ text: 'underlined', marks: { underline: true } },
					', ',
					{ text: 'struck', marks: { strike: true } },
					', ',
					{ text: 'red', marks: { color: '#cc0000' } },
					' and co',
					SHY,
					'operative text.'
				),
				p('center', 'Centered Noto Sans line.'),
				p('body', '')
			]
		}
	},
	{
		name: 'hu-narrow-hyphenated',
		lang: 'hu',
		page: A5,
		region: box(36, 36, 140, 523),
		story: { id: 's-hu', paragraphs: [p('h2', 'Magyar szöveg'), p('body', HU)] }
	},
	{
		name: 'de-narrow-hyphenated',
		lang: 'de',
		page: A5,
		region: box(36, 36, 120, 523),
		story: { id: 's-de', paragraphs: [p('body', DE)] }
	},
	{
		name: 'en-multi-page',
		lang: 'en',
		page: { w: ptToFx(300), h: ptToFx(200) },
		region: box(20, 20, 260, 160),
		story: {
			id: 's-multi',
			paragraphs: [p('h1', 'Many pages'), ...Array.from({ length: 6 }, () => p('body', EN))]
		}
	},
	{
		// Header repeat across pages, col/row spans, a row too tall for a page (clipped + mark),
		// outer and header-only borders.
		name: 'en-table-paginated',
		lang: 'en',
		page: { w: ptToFx(300), h: ptToFx(200) },
		region: box(20, 20, 260, 160),
		story: {
			id: 's-table',
			paragraphs: [
				p('h2', 'Tables'),
				table(
					[
						['Item', 'Qty', 'Note'],
						...Array.from({ length: 8 }, (_, i) => [
							`Row ${i + 1}`,
							String(i + 1),
							i % 3
								? 'Short note.'
								: 'A longer note that wraps onto more than one line.'
						]),
						[
							{ paragraphs: [p('left', 'Spans two rows')], rowSpan: 2 },
							{ paragraphs: [p('left', 'Spans two columns')], colSpan: 2 }
						],
						['9', 'Below the column span.'],
						[{ paragraphs: [p('body', EN), p('body', EN), p('body', EN)], colSpan: 3 }],
						['Last', '10', 'After the clipped row.']
					],
					{ header: 1, cols: [ptToFx(120), ptToFx(40), ptToFx(100)] }
				),
				p('body', 'Text between tables.'),
				table(
					[
						['A', 'B'],
						['c', 'd']
					],
					{ borders: 'outer' }
				),
				table(
					[
						['Head 1', 'Head 2'],
						['e', 'f']
					],
					{ header: 1, borders: 'header' }
				)
			]
		}
	}
]

/** Lay out a corpus case. Pass a fresh registry to check independence from registry state. */
export async function layoutCase(c: Case, registry = new FontRegistry()): Promise<PageDL[]> {
	await initHarfBuzz()
	await loadParagraphFaces(c.story.paragraphs, STYLES, registry, fetchBytes)
	return layoutStory(
		c.story,
		STYLES,
		c.region,
		c.page,
		{ registry, shape: createShapeCache() },
		c.lang
	)
}

/** Stable JSON of display lists (typed arrays → plain arrays). */
export function dlJson(pages: PageDL[]): string {
	return JSON.stringify(pages, (_k, v) =>
		ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v
	)
}

export function sha256(s: string): string {
	return createHash('sha256').update(s).digest('hex')
}

// --- Publication corpus (whole-publication layout; not part of the layoutStory `CORPUS`) ---

/** `STYLES` plus a keep-with-next heading and list styles. */
export const PUB_STYLES: Record<string, StyleDef> = {
	...STYLES,
	kh: { k: 'p', name: 'Kept heading', basedOn: 'h2', props: { keepNext: true } },
	ol: {
		k: 'p',
		name: 'Numbered',
		basedOn: 'left',
		props: { list: { kind: 'ordered', format: '1.', level: 0 } }
	},
	ol2: {
		k: 'p',
		name: 'Numbered 2',
		basedOn: 'left',
		props: { list: { kind: 'ordered', format: 'a)', level: 1 } }
	},
	ul: {
		k: 'p',
		name: 'Bullet',
		basedOn: 'left',
		props: { list: { kind: 'bullet', format: '', level: 0 } }
	}
}

export const field = (f: InlineEmbed): Run => ({ text: '￼', marks: {}, embed: f })

const frame = (
	id: string,
	t: Frame['t'],
	anchor: Frame['anchor'],
	b: Box,
	data: Frame['data'],
	extra: Partial<Frame> = {}
): Frame => ({ id, t, anchor, ...b, rot: 0, z: 0, wrap: { mode: 'none', off: 0 }, data, ...extra })

const MARGINS = { t: ptToFx(40), b: ptToFx(56), in: ptToFx(48), out: ptToFx(32) }
const PUB_MASTERS: Record<string, Master> = {
	'm-first': {
		id: 'm-first',
		...A5,
		margins: MARGINS,
		cols: 1,
		gutter: ptToFx(12),
		regions: [],
		items: ['f-bg', 'f-footer']
	},
	'm-cols': {
		id: 'm-cols',
		...A5,
		margins: MARGINS,
		cols: 2,
		gutter: ptToFx(14),
		regions: [],
		items: ['f-footer'],
		left: { gutter: ptToFx(20) }
	}
}

const PUB_FRAMES: Record<string, Frame> = {
	'f-bg': frame(
		'f-bg',
		'shp',
		{ sec: 's1', page: 0 },
		box(0, 0, 420, 30),
		{
			kind: 'rect',
			fill: '#eeeeee'
		},
		{ z: -1 }
	),
	'f-footer': frame('f-footer', 'txt', { sec: 's1', page: 0 }, box(32, 551, 356, 20), {
		story: {
			id: 'tx-footer',
			paragraphs: [
				p(
					'center',
					'Page ',
					field({ field: 'page' }),
					' / ',
					field({ field: 'pages' }),
					' ',
					field({ field: 'section' })
				)
			]
		}
	} satisfies TextFrameData),
	'f-img': frame(
		'f-img',
		'img',
		{ sec: 's1', page: 0 },
		box(220, 200, 140, 110),
		{
			fileId: 'file-1',
			crop: { x: 0, y: 0, w: 1, h: 1 },
			fit: 'cover',
			alt: 'A picture'
		},
		{ wrap: { mode: 'box', off: ptToFx(6) } }
	),
	'f-note': frame(
		'f-note',
		'txt',
		{ sec: 's1', page: 3 },
		box(48, 300, 324, 80),
		{
			story: { id: 'tx-note', paragraphs: [p('left', HU)] }
		} satisfies TextFrameData,
		{ wrap: { mode: 'tb', off: ptToFx(4) } }
	),
	'f-dot': frame(
		'f-dot',
		'shp',
		{ sec: 's2', page: 0 },
		box(150, 120, 90, 90),
		{
			kind: 'ellipse',
			stroke: '#003366',
			strokeW: ptToFx(1)
		},
		{ z: 1, rot: 15, wrap: { mode: 'box', off: ptToFx(4) } }
	)
}

const S1_STORY: Story = {
	id: 's1',
	paragraphs: [
		p('h1', 'Masters and columns'),
		...Array.from({ length: 4 }, () => p('body', EN)),
		p('kh', 'Lists'),
		p('ol', 'First numbered item.'),
		p('ol', 'Second numbered item, long enough to wrap onto a second line in a column.'),
		p('ol2', 'Nested item.'),
		p('ol2', 'Another nested item.'),
		p('ol', 'Third numbered item.'),
		p('ul', 'A bullet.'),
		p('kh', 'Keep rules'),
		...Array.from({ length: 5 }, () => p('body', EN)),
		{ ...p('body', `${EN} ${DE}`), overrides: { keepTogether: true } },
		{ ...p('body', `${EN} ${EN}`), overrides: { widows: 3, orphans: 3 } },
		p('body', DE),
		p('body', HU)
	]
}

const S2_STORY: Story = {
	id: 's2',
	paragraphs: [
		p('h1', 'Second section'),
		...Array.from({ length: 30 }, (_, i) => p('body', i % 2 ? HU : EN))
	]
}

const BOOK: Publication = {
	lang: 'en',
	styles: PUB_STYLES,
	masters: PUB_MASTERS,
	sections: [
		{ id: 's1', story: S1_STORY, first: 'm-first', rest: 'm-cols', start: 'any' },
		{
			id: 's2',
			story: S2_STORY,
			first: 'm-cols',
			rest: 'm-cols',
			start: 'odd',
			pageNum: { restart: true, format: 'i' },
			maxPages: 2
		}
	],
	frames: PUB_FRAMES,
	facing: true,
	title: 'Corpus book',
	exportedAt: '2026-01-02'
}

/** A footnote body paragraph: `body` at 8/10 pt. */
const note = (text: string): Paragraph => ({
	...p('body', text),
	overrides: { size: ptToFx(8), leading: ptToFx(10), spaceBefore: ptToFx(2) }
})

const FOOTNOTES: Record<string, Story> = {
	n1: { id: 'n1', paragraphs: [note('A short note.')] },
	// Long enough to split across columns.
	n2: { id: 'n2', paragraphs: Array.from({ length: 6 }, (_, i) => note(i % 2 ? DE : EN)) },
	n3: { id: 'n3', paragraphs: [note('Second note of one line.'), note(HU)] }
}

const FN_STORY: Story = {
	id: 'fs',
	paragraphs: [
		p('h1', 'Footnotes'),
		p('body', 'Typesetting', field({ fn: 'n1' }), ` ${EN}`),
		...Array.from({ length: 3 }, () => p('body', EN)),
		p('body', `${EN} A long note`, field({ fn: 'n2' }), ' follows.'),
		p('body', 'Two refs', field({ fn: 'n3' }), ' on one line', field({ fn: 'n1' }), ` ${HU}`),
		...Array.from({ length: 8 }, (_, i) => p('body', i % 2 ? HU : EN)),
		p('body', 'A dangling ref', field({ fn: 'missing' }), ' places nothing.')
	]
}

/** Footnotes in two columns: numbering per section, a body split across columns, two refs per line. */
const FN_PUB: Publication = {
	lang: 'en',
	styles: PUB_STYLES,
	masters: PUB_MASTERS,
	sections: [{ id: 'fs', story: FN_STORY, first: 'm-cols', rest: 'm-cols', start: 'any' }],
	frames: {},
	facing: false,
	footnotes: FOOTNOTES
}

/** A float: an inline image block `w` of the column wide at `side`, with a caption. */
export const floatImg = (side: 'l' | 'r', w: number): Paragraph => ({
	...p('left', ''),
	runs: {
		k: 'emb',
		data: {},
		img: { fileId: 'file-1', crop: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', alt: 'A float' },
		w: ptToFx(160),
		h: ptToFx(100),
		caption: 'Floating',
		float: { side, w }
	}
})

const ADV_STORY: Story = {
	id: 'as',
	paragraphs: [
		{ ...p('h1', 'Advanced text'), overrides: { spanColumns: true } },
		p('left', field({ toc: { levels: 2 } })),
		{ ...p('body', EN), overrides: { dropCap: 3 } },
		p('h2', 'Drop caps'),
		...Array.from({ length: 3 }, (_, i) => ({
			...p('body', i % 2 ? HU : EN),
			overrides: { dropCap: 2 + i }
		})),
		floatImg('l', 0.5),
		p('body', `${EN} ${HU}`),
		floatImg('r', 0.333),
		p('body', `${DE} ${EN}`),
		{ ...p('h2', 'A spanning heading'), overrides: { spanColumns: true } },
		{ ...p('left', 'A spanning paragraph right below it.'), overrides: { spanColumns: true } },
		...Array.from({ length: 6 }, (_, i) => p('body', i % 2 ? DE : EN)),
		p('h2', 'Second part'),
		...Array.from({ length: 10 }, (_, i) => p('body', i % 2 ? HU : EN))
	]
}

/** TOC (two levels, two sections), drop caps of 2–4 lines, span bands at the top and mid-flow. */
const ADV_PUB: Publication = {
	lang: 'en',
	styles: PUB_STYLES,
	masters: PUB_MASTERS,
	sections: [
		{ id: 'as', story: ADV_STORY, first: 'm-cols', rest: 'm-cols', start: 'any' },
		{
			id: 'as2',
			story: {
				id: 'as2',
				paragraphs: [p('h1', 'Appendix'), p('h2', 'Notes'), p('body', EN)]
			},
			first: 'm-first',
			rest: 'm-first',
			start: 'any'
		}
	],
	frames: {},
	facing: false
}

/**
 * Publications exercising masters (first/rest, variants, items with fields), columns, keep rules,
 * wrap (box, tb, rotated), lists, start parity, page-frame keepalive and `maxPages` overset;
 * footnotes; TOC, drop caps and span bands.
 * Treat as immutable (`structuredClone` before editing).
 */
export const PUB_CORPUS: { name: string; pub: Publication }[] = [
	{ name: 'book-facing', pub: BOOK },
	{ name: 'book-plain', pub: { ...BOOK, facing: false } },
	{ name: 'footnotes', pub: FN_PUB },
	{ name: 'advanced-text', pub: ADV_PUB }
]

/** Every story the publication lays out: sections', footnotes', then text frames' (master items included). */
export function publicationStories(pub: Publication): Story[] {
	return [
		...pub.sections.map((s) => s.story),
		...Object.values(pub.footnotes ?? {}),
		...Object.values(pub.frames)
			.filter((f) => f.t === 'txt')
			.map((f) => (f.data as TextFrameData).story)
			.filter((s): s is Story => !!s)
	]
}

/** HarfBuzz + faces of every story of `pub` (and of `extra`); returns a layout env. */
export async function loadPublication(
	pub: Publication,
	registry = new FontRegistry(),
	extra: Paragraph[] = []
): Promise<ItemizeEnv> {
	await initHarfBuzz()
	const paras = [...publicationStories(pub).flatMap((s) => s.paragraphs), ...extra]
	await loadParagraphFaces(paras, pub.styles, registry, fetchBytes)
	return { registry, shape: createShapeCache() }
}
