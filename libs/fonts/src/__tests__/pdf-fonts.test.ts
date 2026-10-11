// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { fontFaceSources, type PdfFontTarget, registerPdfFonts } from '../pdf-fonts'

/** A jsPDF stand-in that records `addFont` calls */
function target() {
	const fonts: string[] = []
	const pdf: PdfFontTarget = {
		addFileToVFS: () => undefined,
		addFont: (file: string, family: string, style: string) =>
			fonts.push(`${file}|${family}|${style}`)
	}
	return { pdf, fonts }
}

describe('registerPdfFonts', () => {
	const realFetch = globalThis.fetch
	let fetched = 0
	beforeAll(() => {
		globalThis.fetch = (async () => {
			fetched++
			return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
		}) as unknown as typeof fetch
	})
	afterAll(() => {
		globalThis.fetch = realFetch
	})

	it('registers each face once per target and skips unknown families', async () => {
		const lato = { family: 'Lato', weight: 'bold', style: 'normal' } as const
		const unknown = { family: 'No Such Font', weight: 'normal', style: 'normal' } as const
		const a = target()
		expect(await registerPdfFonts(a.pdf, [lato, lato, unknown])).toBe(2)
		expect(await registerPdfFonts(a.pdf, [lato])).toBe(1)
		expect(a.fonts).toEqual(['Lato-Bold.ttf|Lato|bold'])

		// A second PDF registers again; the file itself is cached
		const b = target()
		await registerPdfFonts(b.pdf, [lato])
		expect(b.fonts).toHaveLength(1)
		expect(fetched).toBe(1)
	})

	it('loads each registered face in the browser too', async () => {
		const loaded: string[] = []
		Object.defineProperty(document, 'fonts', {
			value: { load: async (font: string) => loaded.push(font) },
			configurable: true
		})
		try {
			const face = { family: 'Lato', weight: 'bold', style: 'italic' } as const
			await registerPdfFonts(target().pdf, [face])
			expect(loaded).toEqual(['italic bold 16px "Lato"'])
		} finally {
			Reflect.deleteProperty(document, 'fonts')
		}
	})
})

describe('fontFaceSources', () => {
	it('lists the four faces of a bundled family, none of an unknown one', () => {
		const faces = fontFaceSources('Lato')
		expect(faces.map((f) => `${f.fontWeight} ${f.fontStyle}`)).toEqual([
			'400 normal',
			'400 italic',
			'700 normal',
			'700 italic'
		])
		expect(faces[2].src).toMatch(/Lato-Bold\.ttf$/)
		expect(fontFaceSources('No Such Font')).toEqual([])
	})
})

// vim: ts=4
