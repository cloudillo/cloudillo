// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { FALLBACK_FONTS, getFontFileUrl } from '@cloudillo/fonts/font-files'
import { FONT_METRICS } from '@cloudillo/fonts/font-metrics'
import { BUNDLED_FONTS, CJK_FALLBACK_FAMILY, FALLBACK_FACE_FAMILY } from '@cloudillo/fonts/metadata'
import type { FontRef } from '../display-list.js'

const FAMILIES = new Set(BUNDLED_FONTS.map((f) => f.family))

/**
 * Han, kana, bopomofo, CJK Symbols & Punctuation (U+3000–303F), the katakana middle dot and
 * prolonged sound mark (U+30FB/30FC, Common script), Enclosed CJK + CJK Compatibility
 * (U+3200–33FF) and Halfwidth/Fullwidth Forms (U+FF00–FFEF). Noto Sans lacks the non-Han ones, so
 * they load the CJK face even without Han. Hangul is left out on purpose: Noto Sans SC is no
 * Korean face; that needs its own KR fallback.
 */
const CJK =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\u3000-\u303f\u30fb\u30fc\u3200-\u33ff\uff00-\uffef]/u

/** Whether `text` needs the CJK fallback face (large, so loaded only when it does). */
export function needsCjkFallback(text: string): boolean {
	return CJK.test(text)
}

/**
 * Bundled faces from `BUNDLED_FONTS` + `FONT_METRICS`. Never synthetic: a missing weight/italic
 * resolves to the nearest face the family ships; an unknown family goes through
 * `FALLBACK_FONTS`, then `FALLBACK_FACE_FAMILY`.
 */
export class FontRegistry {
	private cache = new Map<string, FontRef>()

	resolveFace(family: string, weight: number, italic: boolean): FontRef {
		const key = `${family}|${weight}|${italic}`
		let ref = this.cache.get(key)
		if (!ref) {
			const fam = FAMILIES.has(family)
				? family
				: FAMILIES.has(FALLBACK_FONTS[family] ?? '')
					? FALLBACK_FONTS[family]
					: FALLBACK_FACE_FAMILY
			ref = face(fam, weight, italic) ?? face(FALLBACK_FACE_FAMILY, weight, italic)
			if (!ref) throw new Error(`typeset: no bundled face for ${family}`)
			this.cache.set(key, ref)
		}
		return ref
	}

	/**
	 * Fallback faces for missing glyphs, in order, nearest to `weight`/`italic`. `cjk`: pass
	 * `needsCjkFallback(text)`; `loadParagraphFaces` loads all `cjkFaces()` once any text has CJK.
	 */
	fallbackFaces(weight: number, italic: boolean, cjk: boolean): FontRef[] {
		const base = this.resolveFace(FALLBACK_FACE_FAMILY, weight, italic)
		return cjk ? [base, this.resolveFace(CJK_FALLBACK_FAMILY, weight, italic)] : [base]
	}

	/** Every bundled CJK fallback face, loaded together: any weight may need one (TOC entries). */
	cjkFaces(): FontRef[] {
		const meta = BUNDLED_FONTS.find((f) => f.family === CJK_FALLBACK_FAMILY)
		return (meta?.weights ?? []).map((w) =>
			this.resolveFace(CJK_FALLBACK_FAMILY, w.value, false)
		)
	}
}

function face(family: string, weight: number, italic: boolean): FontRef | undefined {
	const url = getFontFileUrl(
		family,
		weight >= 600 ? 'bold' : 'normal',
		italic ? 'italic' : 'normal'
	)
	const file = url?.slice('/fonts/'.length)
	const m = file ? FONT_METRICS[file] : undefined
	if (!file || !m) return undefined
	return {
		family,
		weight: file.includes('-Bold') ? 700 : 400,
		italic: file.endsWith('Italic.ttf'),
		file,
		upem: m.unitsPerEm
	}
}
