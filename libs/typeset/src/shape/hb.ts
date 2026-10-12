// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FontRef } from '../display-list.js'
import type { Fx } from '../fixed.js'
import { loadedFont } from '../fonts/loader.js'

type HarfBuzz = typeof import('harfbuzzjs')

let hb: HarfBuzz | undefined
let initPromise: Promise<void> | undefined

/**
 * Load harfbuzzjs once. It self-initialises on import and finds `harfbuzz.wasm` next to the
 * importing module (node: `node_modules/harfbuzzjs/dist/`; browser/worker: beside the ESM bundle).
 */
export function initHarfBuzz(): Promise<void> {
	initPromise ??= import('harfbuzzjs').then(
		(m) => {
			hb = m
		},
		(err) => {
			initPromise = undefined
			throw err
		}
	)
	return initPromise
}

/** The initialised harfbuzzjs module; throws before `initHarfBuzz` has resolved. */
export function harfBuzz(): HarfBuzz {
	if (!hb) throw new Error('typeset: initHarfBuzz() has not completed')
	return hb
}

export interface ShapeOptions {
	/** HarfBuzz feature strings, e.g. `['liga=0', 'kern']`. */
	features?: string[]
	/** BCP 47 language, e.g. `'hu'`. */
	lang?: string
	direction?: 'ltr' | 'rtl'
}

/** Shaping output in **font units** (no scale set). Clusters are UTF-16 indices into `text`. */
export interface ShapedRun {
	glyphs: Uint16Array
	clusters: Uint32Array
	advances: Int32Array
	/** `[dx, dy]` pairs, HarfBuzz orientation (y up). */
	offsets: Int32Array
	/** 1 where HarfBuzz flags the glyph `UNSAFE_TO_BREAK`. */
	unsafeToBreak: Uint8Array
}

/** Shape `text` with an already loaded face (`loadFace`). `sizeFx` only keys caches: output is size-independent. */
export function shapeRun(
	ref: FontRef,
	_sizeFx: Fx,
	text: string,
	opts: ShapeOptions = {}
): ShapedRun {
	const h = harfBuzz()
	const buf = new h.Buffer()
	buf.addText(text)
	buf.setDirection(opts.direction === 'rtl' ? h.Direction.RTL : h.Direction.LTR)
	if (opts.lang) buf.setLanguage(opts.lang)
	buf.guessSegmentProperties()
	const features = (opts.features ?? [])
		.map((f) => h.Feature.fromString(f))
		.filter((f) => f !== undefined)
	h.shape(loadedFont(ref), buf, features)

	const infos = buf.getGlyphInfos()
	const pos = buf.getGlyphPositions()
	const n = infos.length
	const run: ShapedRun = {
		glyphs: new Uint16Array(n),
		clusters: new Uint32Array(n),
		advances: new Int32Array(n),
		offsets: new Int32Array(n * 2),
		unsafeToBreak: new Uint8Array(n)
	}
	for (let i = 0; i < n; i++) {
		run.glyphs[i] = infos[i].codepoint
		run.clusters[i] = infos[i].cluster
		run.advances[i] = pos[i].xAdvance
		run.offsets[i * 2] = pos[i].xOffset
		run.offsets[i * 2 + 1] = pos[i].yOffset
		run.unsafeToBreak[i] = infos[i].flags & h.GlyphFlag.UNSAFE_TO_BREAK ? 1 : 0
	}
	return run
}
