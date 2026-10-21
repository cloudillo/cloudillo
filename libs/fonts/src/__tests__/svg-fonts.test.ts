// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { collectSvgFonts, firstFamily, inlineSvgFonts, loadFontFaces } from '../svg-fonts'

const svg = (body: string) =>
	new DOMParser().parseFromString(
		`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
		'image/svg+xml'
	).documentElement

describe('collectSvgFonts', () => {
	it('inherits family, weight and style down the tree', () => {
		const faces = collectSvgFonts(
			svg(
				`<g font-family="Lato" font-weight="bold"><g style="font-style: oblique">` +
					`<text>a<tspan font-weight="400">b</tspan></text></g></g>`
			)
		)
		expect(faces).toEqual([
			{ family: 'Lato', weight: 'bold', style: 'italic' },
			{ family: 'Lato', weight: 'normal', style: 'italic' }
		])
	})

	it('maps 700 to bold, dedupes, and skips text with no family', () => {
		const faces = collectSvgFonts(
			svg(
				`<text font-family="Roboto" font-weight="700">a</text>` +
					`<text font-family="Roboto" font-weight="bold">b</text><text>c</text>`
			)
		)
		expect(faces).toEqual([{ family: 'Roboto', weight: 'bold', style: 'normal' }])
	})
})

describe('firstFamily', () => {
	it('takes the first list entry, unquoted', () => {
		expect(firstFamily(' "Open Sans", serif')).toBe('Open Sans')
	})
})

describe('loadFontFaces', () => {
	const loaded: string[] = []
	beforeAll(() => {
		Object.defineProperty(document, 'fonts', {
			configurable: true,
			value: {
				check: (spec: string) => {
					if (spec.includes('Broken')) throw new SyntaxError('bad font spec')
					return spec.includes('"Lato"')
				},
				load: async (spec: string) => {
					loaded.push(spec)
					return []
				}
			}
		})
	})

	it('loads only the missing faces, and says whether it had to', async () => {
		const lato = { family: 'Lato', weight: 'bold', style: 'normal' } as const
		expect(await loadFontFaces([lato])).toBe(false)
		expect(loaded).toEqual([])
		expect(await loadFontFaces([lato, { ...lato, family: 'Roboto' }])).toBe(true)
		expect(loaded).toEqual(['normal bold 16px "Roboto"'])
	})

	it('survives a family name that would break the spec', async () => {
		loaded.length = 0
		const face = { weight: 'normal', style: 'normal' } as const
		await expect(loadFontFaces([{ ...face, family: 'Broken' }])).resolves.toBe(false)
		await loadFontFaces([{ ...face, family: 'Ro"bo\\to' }])
		expect(loaded).toEqual(['normal normal 16px "Roboto"'])
	})
})

describe('inlineSvgFonts', () => {
	const realFetch = globalThis.fetch
	beforeAll(() => {
		globalThis.fetch = (async () => ({
			ok: true,
			arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
		})) as unknown as typeof fetch
	})
	afterAll(() => {
		globalThis.fetch = realFetch
	})

	it('inlines used faces as data URIs and leaves text-free SVGs alone', async () => {
		const ns = 'xmlns="http://www.w3.org/2000/svg"'
		const out = await inlineSvgFonts(
			`<svg ${ns}><text font-family="Lato" font-weight="bold">a</text></svg>`
		)
		expect(out).toContain('<style>@font-face{font-family:"Lato";font-weight:700')
		expect(out).toContain('data:font/ttf;base64,')

		const plain = `<svg ${ns}><rect width="1" height="1"/></svg>`
		expect(await inlineSvgFonts(plain)).toBe(plain)
	})
})

// vim: ts=4
