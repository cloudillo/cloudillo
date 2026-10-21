// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// @ts-expect-error hyphen 1.14.1 ships no types
import hyphenDe from 'hyphen/de'
// @ts-expect-error hyphen 1.14.1 ships no types
import hyphenEn from 'hyphen/en'
// @ts-expect-error hyphen 1.14.1 ships no types
import hyphenHu from 'hyphen/hu'
// @ts-expect-error linebreak 1.1.0 ships no types
import LineBreaker from 'linebreak'
import type { FontRef } from '../display-list.js'
import type { shapeRun } from '../shape/hb.js'

/**
 * A break opportunity before UTF-16 `offset`. `hyphen` = break inside a word, a hyphen glyph is
 * drawn at the line end (dictionary point or a soft hyphen in the text). The paragraph end is
 * always reported as `mandatory`.
 */
export interface BreakOpp {
	offset: number
	kind: 'mandatory' | 'allowed' | 'hyphen'
}

type Hyphenate = (text: string) => string

// All three pattern sets are bundled eagerly; lazy-load per language if size matters.
const HYPHENATORS: Record<string, Hyphenate> = {
	en: hyphenEn.hyphenateSync,
	de: hyphenDe.hyphenateSync,
	hu: hyphenHu.hyphenateSync
}

const SHY = '­'
const RANK = { hyphen: 0, allowed: 1, mandatory: 2 }

/** UAX#14 break opportunities, plus dictionary hyphenation points for en/hu/de when `hyphenate`. */
export function findBreaks(text: string, lang: string, hyphenate: boolean): BreakOpp[] {
	const opps = new Map<number, BreakOpp['kind']>()
	const put = (offset: number, kind: BreakOpp['kind']) => {
		const old = opps.get(offset)
		if (!old || RANK[kind] > RANK[old]) opps.set(offset, kind)
	}

	const lb = new LineBreaker(text)
	for (let b = lb.nextBreak(); b; b = lb.nextBreak()) {
		const pos: number = b.position
		put(
			pos,
			b.required || pos === text.length
				? 'mandatory'
				: text[pos - 1] === SHY
					? 'hyphen'
					: 'allowed'
		)
	}
	if (!text.length) put(0, 'mandatory')

	const hyph = hyphenate ? HYPHENATORS[lang.toLowerCase().split(/[-_]/)[0]] : undefined
	if (hyph) {
		// The hyphenator only inserts U+00AD: walk both strings to map insertions to offsets.
		const h = hyph(text)
		for (let i = 0, j = 0; j < h.length; j++) {
			if (h[j] === SHY && text[i] !== SHY) {
				if (i > 0) put(i, 'hyphen')
			} else i++
		}
	}
	return [...opps].sort((a, b) => a[0] - b[0]).map(([offset, kind]) => ({ offset, kind }))
}

export interface HyphenGlyph {
	gid: number
	/** Font units. */
	advance: number
}

const hyphenGlyphs = new Map<string, HyphenGlyph>()

/** The face's `-` glyph, shaped once per font (sha256). The face must be loaded. */
export function hyphenGlyph(ref: FontRef, shape: typeof shapeRun): HyphenGlyph {
	let g = hyphenGlyphs.get(ref.sha256)
	if (!g) {
		const run = shape(ref, 0, '-')
		g = { gid: run.glyphs[0], advance: run.advances[0] }
		hyphenGlyphs.set(ref.sha256, g)
	}
	return g
}
