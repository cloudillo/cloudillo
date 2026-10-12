// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

/**
 * Publications exercising masters (first/rest, variants, items with fields), columns, keep rules,
 * wrap (box, tb, rotated), lists, start parity, page-frame keepalive and `maxPages` overset.
 * Treat as immutable (`structuredClone` before editing).
 */
export const PUB_CORPUS: { name: string; pub: Publication }[] = [
	{ name: 'book-facing', pub: BOOK },
	{ name: 'book-plain', pub: { ...BOOK, facing: false } }
]

/** Every story the publication lays out: sections', then text frames' (master items included). */
export function publicationStories(pub: Publication): Story[] {
	return [
		...pub.sections.map((s) => s.story),
		...Object.values(pub.frames)
			.filter((f) => f.t === 'txt')
			.map((f) => (f.data as TextFrameData).story)
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
