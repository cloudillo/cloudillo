// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// `image` items: bytes from `PdfEnv.fetchImage` (JPEG passes through as DCT, PNG via pdfkit),
// cropped with the same `cropGeom` as the screen, clipped to the visible part.

import type { DLItem } from '../display-list.js'
import { fxToPt } from '../fixed.js'
import { cropGeom, cropOf } from '../geometry.js'
import { type PdfGfx, type PdfImage, writeMissingImage } from './graphics.js'

type ImageItem = Extract<DLItem, { k: 'image' }>

/** Opened images by `fileId`; null = could not be fetched or decoded. Each is embedded once. */
export type ImageCache = Map<string, PdfImage | null>

export async function writeImage(
	doc: PdfGfx,
	it: ImageItem,
	cache: ImageCache,
	fetch: (fileId: string) => Promise<ArrayBuffer>,
	signal?: AbortSignal,
	onMissing?: (fileId: string) => void
): Promise<void> {
	let img = cache.get(it.fileId)
	if (img === undefined) {
		try {
			let bytes: Uint8Array = new Uint8Array(await fetch(it.fileId))
			if (bytes[0] === 0xff && bytes[1] === 0xd8) bytes = stripJpegMetadata(bytes)
			img = doc.openImage(bytes)
		} catch (err) {
			signal?.throwIfAborted()
			// Not JPEG/PNG, or the fetch failed: the export goes on with a placeholder.
			console.warn(`[pdf] image ${it.fileId} skipped:`, err)
			onMissing?.(it.fileId)
			img = null
		}
		cache.set(it.fileId, img)
	}
	if (!img) {
		writeMissingImage(doc, it.box)
		return
	}

	const b = it.box
	const box = { x: fxToPt(b.x), y: fxToPt(b.y), w: fxToPt(b.w), h: fxToPt(b.h) }
	// Displayed size: pdfkit applies the EXIF orientation as browsers do.
	const turned = (img.orientation ?? 1) > 4
	const aspect = turned ? img.height / img.width : img.width / img.height
	const { full, clip } = cropGeom(box, cropOf(it.crop), it.fit, aspect)
	doc.save()
	doc.rect(clip.x, clip.y, clip.w, clip.h).clip()
	doc.image(img, full.x, full.y, { width: full.w, height: full.h })
	doc.restore()
}

/** EXIF Orientation (0x0112) of an APP1 payload (after the length), or 1. */
function exifOrientation(b: Uint8Array, at: number, end: number): number {
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
	const t = at + 6
	if (t + 8 > end) return 1
	const le = b[t] === 0x49 && b[t + 1] === 0x49
	if (!le && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return 1
	const ifd = t + v.getUint32(t + 4, le)
	if (ifd + 2 > end) return 1
	const n = v.getUint16(ifd, le)
	for (let i = 0; i < n; i++) {
		const e = ifd + 2 + i * 12
		if (e + 12 > end) return 1
		if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le)
	}
	return 1
}

const EXIF = [0x45, 0x78, 0x69, 0x66, 0, 0]

/**
 * JPEG without its privacy metadata: APP1 (Exif/XMP), APP13 (IPTC) and COM before SOS are
 * dropped; APP0/APP2 (ICC)/APP14 (Adobe) stay for colour. A non-1 EXIF orientation comes back
 * as a minimal APP1 after SOI (pdfkit and `writeImage` read it). Malformed input is returned as is.
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
	const keep: Uint8Array[] = [b.subarray(0, 2)]
	let orientation = 1
	let p = 2
	for (;;) {
		if (p + 4 > b.length || b[p] !== 0xff) return b
		const m = b[p + 1]
		if (m === 0xff) {
			p++ // fill byte
			continue
		}
		if (m === 0xda) {
			keep.push(b.subarray(p))
			break
		}
		if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
			keep.push(b.subarray(p, p + 2))
			p += 2
			continue
		}
		const end = p + 2 + ((b[p + 2] << 8) | b[p + 3])
		if (end > b.length || end < p + 4) return b
		const isExif = m === 0xe1 && EXIF.every((c, i) => b[p + 4 + i] === c)
		if (isExif && orientation === 1) orientation = exifOrientation(b, p + 4, end)
		if (m !== 0xe1 && m !== 0xed && m !== 0xfe) keep.push(b.subarray(p, end))
		p = end
	}
	if (orientation > 1 && orientation <= 8) {
		// biome-ignore format: byte layout
		const app1 = new Uint8Array([
			0xff, 0xe1, 0, 34, ...EXIF,
			0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, // TIFF header (MM), IFD0 at 8
			0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // one SHORT entry
			0, 0, 0, 0 // no next IFD
		])
		keep.splice(1, 0, app1)
	}
	const out = new Uint8Array(keep.reduce((n, k) => n + k.length, 0))
	let at = 0
	for (const k of keep) {
		out.set(k, at)
		at += k.length
	}
	return out
}

// vim: ts=4
