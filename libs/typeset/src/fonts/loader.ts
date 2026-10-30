// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { Font } from 'harfbuzzjs'
import type { FontRef } from '../display-list.js'
import { harfBuzz } from '../shape/hb.js'

/**
 * Injectable byte source: node tests read from disk, browsers `fetch`. The bytes are not
 * verified; callers must serve them from a trusted (same-origin) source.
 */
export type FetchBytes = (url: string) => Promise<ArrayBuffer>

const pending = new Map<string, Promise<Font>>()
const loaded = new Map<string, Font>()
const paths = new Map<string, string>()

/** URL of a face's TTF, origin-relative (`/fonts/<dir>/<File>.ttf`). */
export function fontUrl(ref: FontRef): string {
	return `/fonts/${ref.file}`
}

/** Load a face once per file; concurrent callers share the same promise. */
export function loadFace(ref: FontRef, fetchBytes: FetchBytes): Promise<Font> {
	let p = pending.get(ref.file)
	if (!p) {
		p = fetchBytes(fontUrl(ref)).then((bytes) => {
			const hb = harfBuzz()
			// Variations are never applied: residual fvar axes stay at the default instance.
			const font = new hb.Font(new hb.Face(new hb.Blob(bytes)))
			loaded.set(ref.file, font)
			return font
		})
		p.catch(() => pending.delete(ref.file))
		pending.set(ref.file, p)
	}
	return p
}

/** The hb font for an already loaded face; throws if `loadFace` has not resolved yet. */
export function loadedFont(ref: FontRef): Font {
	const font = loaded.get(ref.file)
	if (!font) throw new Error(`typeset: font not loaded: ${ref.file}`)
	return font
}

/** SVG path of a glyph in font units, y up (the renderer flips it). Cached. */
export function glyphPath(ref: FontRef, gid: number): string {
	const key = `${ref.file}:${gid}`
	let d = paths.get(key)
	if (d === undefined) {
		d = loadedFont(ref).glyphToPath(gid)
		paths.set(key, d)
	}
	return d
}
