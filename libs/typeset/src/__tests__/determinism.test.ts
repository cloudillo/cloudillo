// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from '@jest/globals'

import { FontRegistry } from '../fonts/registry.js'
import { renderPageSvgStandalone } from '../svg/render.js'
import { CORPUS, dlJson, glyphPath, layoutCase, sha256 } from './corpus.js'

// Fresh registries and shape caches per run. The loader's face cache is module-global
// (keyed by sha256), so loaded faces are shared — by design, faces are immutable.
describe('determinism', () => {
	it.each(CORPUS.map((c) => [c.name, c] as const))(
		'%s lays out identically twice',
		async (_name, c) => {
			const a = await layoutCase(c, new FontRegistry())
			const b = await layoutCase(c, new FontRegistry())
			expect(sha256(dlJson(b))).toBe(sha256(dlJson(a)))
		}
	)

	it('does not depend on the order of layouts', async () => {
		const first = await Promise.all(CORPUS.map((c) => layoutCase(c)))
		const reversed = await Promise.all([...CORPUS].reverse().map((c) => layoutCase(c)))
		reversed.reverse()
		expect(reversed.map((p) => sha256(dlJson(p)))).toEqual(first.map((p) => sha256(dlJson(p))))
	})

	it('renders identical SVG twice', async () => {
		const c = CORPUS[0]
		const [a, b] = [await layoutCase(c), await layoutCase(c)]
		expect(sha256(renderPageSvgStandalone(b[0], glyphPath))).toBe(
			sha256(renderPageSvgStandalone(a[0], glyphPath))
		)
	})
})
