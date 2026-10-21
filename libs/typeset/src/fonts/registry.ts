// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { FALLBACK_FONTS, getFontFileUrl } from '@cloudillo/fonts/font-files'
import { FONT_METRICS } from '@cloudillo/fonts/font-metrics'
import { FALLBACK_FACE_FAMILY, FONTS } from '@cloudillo/fonts/metadata'
import type { FontRef } from '../display-list.js'

const FAMILIES = new Set(FONTS.map((f) => f.family))

/**
 * Bundled faces from `FONTS` + `FONT_METRICS`. Never synthetic: a missing weight/italic resolves to
 * the nearest face the family ships; an unknown family goes through `FALLBACK_FONTS`, then
 * `FALLBACK_FACE_FAMILY`.
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

	/** The bundled fallback face (missing glyphs), nearest to `weight`/`italic`. */
	fallbackFace(weight: number, italic: boolean): FontRef {
		return this.resolveFace(FALLBACK_FACE_FAMILY, weight, italic)
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
		sha256: m.sha256,
		upem: m.unitsPerEm
	}
}
