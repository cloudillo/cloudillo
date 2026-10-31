// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { beforeAll, describe, expect, it } from '@jest/globals'

import { FontRegistry, needsCjkFallback } from '../fonts/registry.js'
import type { Paragraph } from '../model.js'
import { createShapeCache } from '../shape/cache.js'
import { initHarfBuzz } from '../shape/hb.js'
import { type ItemizedParagraph, itemizeParagraph, loadParagraphFaces } from '../text/itemize.js'
import { fetchBytes, p, STYLES } from './corpus.js'

async function itemize(para: Paragraph) {
	const registry = new FontRegistry()
	await loadParagraphFaces([para], STYLES, registry, fetchBytes)
	return itemizeParagraph(para, STYLES, { registry, shape: createShapeCache() }, 'en')
}

function runOf(ip: ItemizedParagraph, s: string) {
	return ip.runs.find((r) => ip.text.slice(r.from, r.to) === s)
}

describe('glyph fallback chain', () => {
	beforeAll(initHarfBuzz)

	it('shapes CJK on Noto Sans SC', async () => {
		const ip = await itemize(p('left', 'Hello 你好'))
		const cjk = runOf(ip, '你好')
		expect(cjk?.font.family).toBe('Noto Sans SC')
		expect(cjk?.shaped.glyphs).not.toContain(0)
		expect(ip.runs[0].font.family).toBe('Lato')
	})

	it('picks the bold CJK face for bold text', async () => {
		const ip = await itemize(p('left', 'Hello ', { text: '你好', marks: { bold: true } }))
		expect(runOf(ip, '你好')?.font.file).toMatch(/NotoSansSc-Bold\.ttf$/)
	})

	it('falls back to CJK from a Noto Sans primary', async () => {
		const ip = await itemize(p('center', 'Hello 你好'))
		expect(ip.runs[0].font.family).toBe('Noto Sans')
		expect(runOf(ip, '你好')?.font.family).toBe('Noto Sans SC')
	})

	it('ends the chain on the last face with .notdef', async () => {
		const ip = await itemize(p('left', '你\uE000'))
		const pua = ip.runs.find((r) => ip.text.slice(r.from, r.to).includes('\uE000'))
		expect(pua?.font.family).toBe('Noto Sans SC')
		expect(pua?.shaped.glyphs).toContain(0)
	})

	it('detects CJK text, Common-script CJK marks included', () => {
		for (const t of ['你', 'ー', '・', '㈱', '㌀', '，', '。'])
			expect(needsCjkFallback(t)).toBe(true)
		// Hangul deliberately excluded: Noto Sans SC is no Korean face
		for (const t of ['Hello', 'Ünïcödé', '한국어']) expect(needsCjkFallback(t)).toBe(false)
	})
})
