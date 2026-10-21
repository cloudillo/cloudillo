// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Tagged (PDF/UA-1 when every figure has alt text) and PDF/A-2a output parses: header, page
// count, title, MarkInfo, structure tree, XMP identification. Real JPEG/PNG bytes embed (no
// placeholder), and `stripJpegMetadata` drops Exif/IPTC/COM but keeps orientation and colour. With `PDF_OUT=<dir>` every PDF is also written there
// (`<case>.pdf`, `<case>-pdfa.pdf`) — `scripts/verapdf.sh` validates those.

import { mkdir, writeFile } from 'node:fs/promises'

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'

import type { PageDL } from '../display-list.js'
import { FX } from '../fixed.js'
import { layoutPublication } from '../layout/paginate.js'
import { stripJpegMetadata } from '../pdf/images.js'
import { hasBareFigure, writePdf } from '../pdf/writer.js'
import { CORPUS, fetchBytes, layoutCase, loadPublication, PUB_CORPUS } from './corpus.js'

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: Pdfjs

beforeAll(async () => {
	// Fake worker in-process: pdfjs uses `globalThis.pdfjsWorker` before trying to import workerSrc.
	// @ts-expect-error the worker entry ships no typings
	const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
	;(globalThis as Record<string, unknown>).pdfjsWorker = worker
	pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
	if (OUT) await mkdir(OUT, { recursive: true })
})

// Missing image bytes → grey placeholder + console.warn; the warning is expected here.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
afterAll(() => warn.mockRestore())

const OUT = process.env.PDF_OUT

const env = {
	fonts: fetchBytes,
	fetchImage: () => Promise.reject(new Error('no images in the smoke test'))
}

const CASES: [string, () => Promise<PageDL[]>][] = [
	...CORPUS.map((c) => [c.name, () => layoutCase(c)] as [string, () => Promise<PageDL[]>]),
	...PUB_CORPUS.map(
		(c) =>
			[c.name, async () => layoutPublication(c.pub, await loadPublication(c.pub)).pages] as [
				string,
				() => Promise<PageDL[]>
			]
	)
]

describe.each(CASES)('pdf smoke %s', (name, layout) => {
	it.each([false, true])('pdfa: %s', async (pdfa) => {
		const pages = await layout()
		const title = `Smoke ${name}`
		const bytes = await writePdf(
			pages,
			{ title, author: 'Cloudillo', lang: 'en', pdfa, downsample: 'none' },
			env
		)
		if (OUT) await writeFile(`${OUT}/${name}${pdfa ? '-pdfa' : ''}.pdf`, bytes)

		expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('%PDF-1.7')

		const task = pdfjs.getDocument({ data: bytes.slice() })
		const doc = await task.promise
		try {
			expect(doc.numPages).toBe(pages.length)

			const meta = await doc.getMetadata()
			expect((meta.info as { Title?: string }).Title).toBe(title)
			// pdfjs 6 types this as an object but resolves a Map
			const mark = (await doc.getMarkInfo()) as unknown as Map<string, boolean> | null
			expect(mark?.get('Marked')).toBe(true)

			const tree = await (await doc.getPage(1)).getStructTree()
			expect(tree?.children.length).toBeGreaterThan(0)

			const xmp = meta.metadata?.getRaw() ?? ''
			expect(xmp.includes('pdfuaid')).toBe(pages.every((p) => !hasBareFigure(p.tags)))
			expect(xmp.includes('pdfaid:part')).toBe(pdfa)
		} finally {
			await task.destroy()
		}
	})
})

// 8×4 baseline JPEG and 4×4 RGBA PNG (ImageMagick, `-strip`).
const JPEG = Buffer.from(
	'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAEAAgDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABcQAAMBAAAAAAAAAAAAAAAAAAAEFVL/xAAVAQEBAAAAAAAAAAAAAAAAAAAEB//EABcRAAMBAAAAAAAAAAAAAAAAAAAFFlL/2gAMAwEAAhEDEQA/ADmgzsokytwNoWGz/9k=',
	'base64'
)
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAABmJLR0QAAACAAAAYdqD/AAAAFUlEQVQI12NkaGD4z4AEmBjQAGEBAGIUAYcy/cpSAAAAAElFTkSuQmCC',
	'base64'
)

const seg = (marker: number, payload: number[]) => [
	0xff,
	marker,
	(payload.length + 2) >> 8,
	(payload.length + 2) & 0xff,
	...payload
]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const SECRET = ascii('GPS 47.4979N SERIAL-0xC0FFEE')
/** Little-endian Exif APP1: IFD0 with ImageDescription (a secret) then Orientation = 6. */
const EXIF_APP1 = seg(0xe1, [
	...ascii('Exif\0\0'),
	...[0x49, 0x49, 0x2a, 0, 8, 0, 0, 0], // II, IFD0 at 8
	...[2, 0],
	...[0x0e, 0x01, 2, 0, SECRET.length, 0, 0, 0, 38, 0, 0, 0], // ASCII at 38
	...[0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0],
	...[0, 0, 0, 0],
	...SECRET
])
const ICC_APP2 = seg(0xe2, ascii('ICC_PROFILE\0fake'))
const ADOBE_APP14 = seg(0xee, ascii('Adobe\0fake'))
const IPTC_APP13 = seg(0xed, ascii('Photoshop 3.0\0').concat(SECRET))
const COM = seg(0xfe, SECRET)
/** The JPEG with metadata segments spliced in after SOI. */
const withMeta = (...segs: number[][]) =>
	new Uint8Array([0xff, 0xd8, ...segs.flat(), ...JPEG.subarray(2)])

const has = (b: Uint8Array, needle: number[]) => Buffer.from(b).indexOf(Buffer.from(needle)) >= 0

describe('stripJpegMetadata', () => {
	it('drops Exif/IPTC/COM, keeps orientation, ICC and Adobe', () => {
		const out = stripJpegMetadata(withMeta(EXIF_APP1, ICC_APP2, IPTC_APP13, COM, ADOBE_APP14))
		expect(has(out, SECRET)).toBe(false)
		expect(has(out, ICC_APP2)).toBe(true)
		expect(has(out, ADOBE_APP14)).toBe(true)
		// Only the minimal orientation block remains: MM, one Orientation SHORT = 6.
		expect([...out.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1])
		expect(out.subarray(6, 12)).toEqual(new Uint8Array(ascii('Exif\0\0')))
		expect([...out.subarray(20, 34)]).toEqual([0, 1, 1, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0])
		expect(Buffer.from(out).indexOf(Buffer.from(ascii('Exif')), 7)).toBe(-1)
		expect(out.subarray(out.length - JPEG.length + 2)).toEqual(new Uint8Array(JPEG.subarray(2)))
	})

	it('adds no Exif block for orientation 1', () => {
		expect(stripJpegMetadata(withMeta(COM))).toEqual(new Uint8Array(JPEG))
	})

	it('returns garbage unchanged', () => {
		const junk = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3])
		expect(stripJpegMetadata(junk)).toBe(junk)
		const trunc = new Uint8Array([0xff, 0xd8, 0x12, 0x34])
		expect(stripJpegMetadata(trunc)).toBe(trunc)
	})
})

describe('pdf images', () => {
	it('embeds real JPEG and PNG bytes', async () => {
		const box = { x: 72 * FX, y: 72 * FX, w: 144 * FX, h: 72 * FX }
		const page: PageDL = {
			page: { sec: 's', index: 0, w: 595 * FX, h: 842 * FX, master: 'm' },
			items: [
				{
					k: 'image',
					fileId: 'jpg',
					box,
					crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
					fit: 'cover',
					tag: 1,
					rot: { deg: 15, cx: 144 * FX, cy: 108 * FX }
				},
				{
					k: 'image',
					fileId: 'png',
					box: { ...box, y: 200 * FX },
					crop: { x: 0, y: 0, w: 1, h: 1 },
					fit: 'contain',
					tag: 2
				}
			],
			lines: [],
			tags: [
				{ id: 1, role: 'Figure', alt: 'Photo' },
				{ id: 2, role: 'Figure', alt: 'Dot' }
			],
			rev: 0
		}
		const bytesOf: Record<string, Uint8Array> = {
			jpg: withMeta(EXIF_APP1, COM),
			png: new Uint8Array(PNG)
		}
		warn.mockClear()
		const bytes = await writePdf(
			[page],
			{ title: 'Images', pdfa: false, downsample: 'none' },
			{
				fonts: fetchBytes,
				fetchImage: async (id) => bytesOf[id].slice().buffer
			}
		)
		expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[pdf] image'))).toBe(false)
		expect(has(bytes, SECRET)).toBe(false)

		const task = pdfjs.getDocument({ data: bytes.slice() })
		try {
			const doc = await task.promise
			const ops = await (await doc.getPage(1)).getOperatorList()
			const paints = ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject)
			expect(paints.length).toBe(2)
			expect((await doc.getMetadata()).metadata?.getRaw()).toContain('pdfuaid')
		} finally {
			await task.destroy()
		}
	})
})
