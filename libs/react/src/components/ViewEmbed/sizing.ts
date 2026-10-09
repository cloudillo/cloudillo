// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Host-side sizing of an embedded view: turns the source's reported natural size and the
 * host's sizing settings into a frame size and the scale the source should render at.
 */

import { clampNatural, type EmbedSizing, type EmbedViewKind, MAX_NATURAL } from '@cloudillo/core'

export { clampNatural, MAX_NATURAL }

/** Per-embed host settings, stored by the host document next to the embed's ref. */
export type EmbedViewSettings = {
	sizing: EmbedSizing
	/** `actual` mode: requested scale for a fixed view (1 = 100%) */
	scale?: number
	/** Reflow view: maximum frame height in px; taller content scrolls inside the frame */
	maxH?: number
	/** Reflow view: text scale passed through to the source */
	textScale?: number
	/** Last reported natural size, used before the source reports */
	lastNatural?: [number, number]
	editInPlace?: boolean
	/** Frame width as % of the line (10–100); undefined = 100. Caps a fixed view's frame */
	width?: number
	/** Frame alignment within the line; undefined = left */
	align?: 'left' | 'center' | 'right'
}

export interface EmbedFrameInput {
	sizing: EmbedSizing
	kind: EmbedViewKind
	/** Reported natural size; omitted before the first report */
	natural?: { w: number; h: number }
	availW: number
	/** Frame size in `box` mode */
	box?: { w: number; h: number }
	scale?: number
	maxH?: number
	/** Frame width as % of `availW` (a cap for a fixed view) */
	width?: number
	/** The source reported its view as missing: keep room for the placeholder */
	missing?: boolean
}

export interface EmbedFrame {
	w: number
	h: number
	scale: number
	innerScroll: boolean
}

const FALLBACK_H = 400
/** Matches the placeholder's `min-height: 6rem` */
export const MISSING_MIN_H = 96

/** Bound a layout scale to the `embed:view.layout` wire range (0.05–20). */
export const clampLayoutScale = (s: number) => Math.min(20, Math.max(0.05, s))

/** Transaction origin of layout-derived writes: not the client id, so the UndoManager skips them */
export const LAYOUT_ORIGIN = 'layout'

/**
 * Whether a reported natural size differs enough from the stored one to persist. Writers with
 * different viewport widths measure a reflow view differently; a coarse threshold keeps them
 * from ping-ponging the stored size through the host document.
 */
export function naturalSizeChanged(
	stored: { w: number; h: number },
	next: { w: number; h: number }
) {
	const moved = (a: number, b: number) => Math.abs(a - b) > Math.max(8, a * 0.05)
	return moved(stored.w, next.w) || moved(stored.h, next.h)
}

/** A reported natural size clamped and rounded for storage; null when it has no area */
export function storableNatural(n: { w: number; h: number }): [number, number] | null {
	const { w, h } = clampNatural(n)
	return w && h ? [Math.round(w), Math.round(h)] : null
}

export function computeEmbedFrame(input: EmbedFrameInput): EmbedFrame {
	const frame = computeFrame(input)
	if (input.missing && frame.h < MISSING_MIN_H) {
		return { ...frame, h: MISSING_MIN_H }
	}
	return frame
}

function computeFrame({
	sizing,
	kind,
	natural,
	availW,
	box,
	scale,
	maxH,
	width
}: EmbedFrameInput): EmbedFrame {
	const n = clampNatural(natural ?? { w: availW, h: FALLBACK_H })
	const nw = Math.max(1, n.w)
	const nh = Math.max(1, n.h)

	if (sizing === 'box') {
		const b = box ?? { w: availW, h: nh }
		return kind === 'fixed'
			? { w: b.w, h: b.h, scale: Math.min(b.w / nw, b.h / nh), innerScroll: false }
			: { w: b.w, h: b.h, scale: 1, innerScroll: true }
	}

	if (kind === 'reflow') {
		const limit = maxH ?? Number.POSITIVE_INFINITY
		const w = Math.round((availW * (width ?? 100)) / 100)
		return { w, h: Math.min(nh, limit), scale: 1, innerScroll: nh > limit }
	}

	const availFixed = (availW * (width ?? 100)) / 100
	const s = Math.min(sizing === 'actual' ? (scale ?? 1) : 1, availFixed / nw)
	return { w: Math.round(nw * s), h: Math.round(nh * s), scale: s, innerScroll: false }
}

/** Positive finite number (a numeric string counts), else undefined — 0 means unset. */
export function positiveNumber(value: unknown): number | undefined {
	const n = typeof value === 'string' ? Number(value) : value
	return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}

// `box` is canvas-only (`SvgViewEmbed` forces it); a flow host never stores it on purpose
const SIZINGS: readonly unknown[] = ['fit-width', 'actual'] satisfies EmbedSizing[]
const ALIGNS: readonly unknown[] = ['left', 'center', 'right']

/** Stored per-embed values as a host document holds them: untyped, possibly forged. */
export interface StoredEmbedSettings {
	sizing?: unknown
	align?: unknown
	scale?: unknown
	maxH?: unknown
	textScale?: unknown
	/** % of the line; 100 or more = full width */
	width?: unknown
	lastW?: unknown
	lastH?: unknown
}

/** Whitelist and type-check stored embed settings of a flow (non-canvas) host. */
export function normalizeEmbedSettings(
	raw: StoredEmbedSettings,
	defaultAlign: NonNullable<EmbedViewSettings['align']>
): EmbedViewSettings {
	const lastW = positiveNumber(raw.lastW)
	const lastH = positiveNumber(raw.lastH)
	const width = positiveNumber(raw.width)
	return {
		sizing: SIZINGS.includes(raw.sizing) ? (raw.sizing as EmbedSizing) : 'fit-width',
		scale: positiveNumber(raw.scale),
		maxH: positiveNumber(raw.maxH),
		textScale: positiveNumber(raw.textScale),
		lastNatural: lastW && lastH ? [lastW, lastH] : undefined,
		width: width && width < 100 ? width : undefined,
		align: ALIGNS.includes(raw.align) ? (raw.align as EmbedViewSettings['align']) : defaultAlign
	}
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round5 = (v: number) => Math.round(v / 5) * 5

/**
 * Settings after the user dragged the frame to `newFrameW`: a fixed view switches to `actual`
 * at the matching scale, a reflow view stores its width as % of the line. Both snap to 5%.
 */
export function resizeSettings(
	settings: EmbedViewSettings,
	kind: EmbedViewKind,
	natural: { w: number; h: number } | undefined,
	availW: number,
	newFrameW: number
): EmbedViewSettings {
	if (kind === 'fixed') {
		const nw = Math.max(1, clampNatural(natural ?? { w: availW, h: 0 }).w)
		return {
			...settings,
			sizing: 'actual',
			scale: clamp(round5((newFrameW / nw) * 100), 25, 400) / 100,
			// The dragged size is the scale now: a stale width share would cap it back
			width: undefined
		}
	}
	return { ...settings, width: clamp(round5((newFrameW / Math.max(1, availW)) * 100), 10, 100) }
}

// vim: ts=4
