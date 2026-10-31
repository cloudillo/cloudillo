// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { beforeAll, describe, expect, it } from '@jest/globals'

import { ptToFx } from '../fixed.js'
import type { FetchBytes } from '../fonts/loader.js'
import { FontRegistry } from '../fonts/registry.js'
import type { Paragraph } from '../model.js'
import { createShapeCache } from '../shape/cache.js'
import { initHarfBuzz } from '../shape/hb.js'
import { type ItemizedParagraph, itemizeParagraph, loadParagraphFaces } from '../text/itemize.js'
import { fetchBytes, p, STYLES, table } from './corpus.js'

const SC = ['/fonts/noto-sans-sc/NotoSansSc-Regular.ttf', '/fonts/noto-sans-sc/NotoSansSc-Bold.ttf']

describe('fallback face loading', () => {
	beforeAll(initHarfBuzz)

	// One test: `loadFace` caches per module, so each step only sees fetches the earlier ones
	// didn't make. Its own file gives it an empty cache.
	it('loads every face it itemizes, and all CJK faces once any text has CJK', async () => {
		const urls = new Set<string>()
		const spy: FetchBytes = (url) => {
			urls.add(url)
			return fetchBytes(url)
		}
		const registry = new FontRegistry()
		const env = { registry, shape: createShapeCache() }

		await loadParagraphFaces([p('left', 'Hello')], STYLES, registry, spy)
		expect([...urls].filter((u) => u.includes('noto-sans-sc'))).toEqual([])

		// An embed caption is laid out as text, though `paragraphText` is empty for it
		const emb: Paragraph = {
			bid: 'emb',
			style: 'left',
			overrides: {},
			runs: { k: 'emb', data: {}, w: ptToFx(100), h: ptToFx(50), caption: '图注' }
		}
		await loadParagraphFaces([emb], STYLES, registry, spy)
		for (const u of SC) expect(urls).toContain(u)

		const paras = [p('left', 'Hi 你好'), table([['表格']]), p('left', '图注')]
		await loadParagraphFaces(paras, STYLES, registry, spy)
		const files = new Set<string>()
		const collect = (ip: ItemizedParagraph) => {
			for (const r of ip.runs) files.add(r.font.file)
			for (const row of ip.cells ?? []) for (const cell of row) cell.forEach(collect)
		}
		for (const para of paras) collect(itemizeParagraph(para, STYLES, env, 'en'))
		expect(files).toContain('noto-sans-sc/NotoSansSc-Regular.ttf')
		for (const f of files) expect(urls).toContain(`/fonts/${f}`)
	})
})
