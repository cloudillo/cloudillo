// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { beforeAll, describe, expect, it } from '@jest/globals'

import { FontRegistry } from '../fonts/registry.js'
import { createShapeCache } from '../shape/cache.js'
import { initHarfBuzz } from '../shape/hb.js'
import { itemizeParagraph, loadParagraphFaces } from '../text/itemize.js'
import { fetchBytes, p, STYLES } from './corpus.js'

describe('CJK faces across weights', () => {
	beforeAll(initHarfBuzz)

	// Own file: `loadFace` caches per module, so no other test may have loaded the regular face.
	// TOC entries itemize heading text in another weight than the heading itself.
	it('itemizes CJK at a weight the loaded text never used', async () => {
		const registry = new FontRegistry()
		await loadParagraphFaces(
			[p('left', { text: '你好', marks: { bold: true } })],
			STYLES,
			registry,
			fetchBytes
		)
		const ip = itemizeParagraph(
			p('left', '你好'),
			STYLES,
			{ registry, shape: createShapeCache() },
			'en'
		)
		expect(ip.runs[0].font.file).toBe('noto-sans-sc/NotoSansSc-Regular.ttf')
	})
})
