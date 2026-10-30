// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { FontRef, PageDL } from '../display-list.js'
import { type FetchBytes, fontUrl } from '../fonts/loader.js'
import { embedFace, type PdfDoc, type PdfFace } from './glyph-ops.js'

/** The same TTF bytes the engine shaped with, fetched from `fontUrl(ref)`. */
async function faceBytes(ref: FontRef, fetchBytes: FetchBytes): Promise<Uint8Array> {
	return new Uint8Array(await fetchBytes(fontUrl(ref)))
}

/** One face (as `embedFonts`). */
export async function embedOneFace(
	doc: PdfDoc,
	ref: FontRef,
	fetchBytes: FetchBytes
): Promise<PdfFace> {
	return embedFace(doc, await faceBytes(ref, fetchBytes))
}

/**
 * Embed every face the pages' glyph runs use, keyed by `FontRef.file`. Faces are registered in
 * order of first use, so `/F<n>` names are deterministic.
 */
export async function embedFonts(
	doc: PdfDoc,
	pages: PageDL[],
	fetchBytes: FetchBytes
): Promise<Map<string, PdfFace>> {
	const refs = new Map<string, FontRef>()
	for (const p of pages) {
		for (const it of p.items) {
			if (it.k === 'glyphs' && !refs.has(it.font.file)) refs.set(it.font.file, it.font)
		}
	}
	const bytes = await Promise.all([...refs.values()].map((ref) => faceBytes(ref, fetchBytes)))
	const faces = new Map<string, PdfFace>()
	let i = 0
	for (const file of refs.keys()) faces.set(file, embedFace(doc, bytes[i++]))
	return faces
}
