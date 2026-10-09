// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Source-side helpers for view embedding.
 */

import { type AppMessageBus, getAppBus } from './message-bus/app-bus.js'
import type { EmbedViewReportPayload } from './message-bus/types.js'

/** Upper bound on a reported natural dimension (the `embed:view.report` wire bound) */
export const MAX_NATURAL = 20000

const clampDim = (v: number) => (Number.isFinite(v) ? Math.min(MAX_NATURAL, Math.max(0, v)) : 0)

/** Bound a natural size to finite, non-negative, sane values (NaN → 0). */
export function clampNatural(n: { w: number; h: number }): { w: number; h: number } {
	return { w: clampDim(n.w), h: clampDim(n.h) }
}

/**
 * Split a view nav string (`kind:value`) on its first `:`.
 * A bare string (legacy, app-specific) yields `kind: ''`.
 */
export function parseNav(nav: string): { kind: string; value: string } {
	const i = nav.indexOf(':')
	return i < 0 ? { kind: '', value: nav } : { kind: nav.slice(0, i), value: nav.slice(i + 1) }
}

/**
 * Report a reflowing view whose natural size is `el`'s width × scroll height,
 * re-reporting whenever `el` resizes. Returns a cleanup function.
 */
export function observeReflowView(
	el: HTMLElement,
	base: Omit<EmbedViewReportPayload, 'kind' | 'natural'>,
	bus?: AppMessageBus
): () => void {
	const b = bus ?? getAppBus()
	const report = () => {
		b.reportView({
			...base,
			kind: 'reflow',
			natural: { w: el.clientWidth, h: el.scrollHeight }
		})
	}
	const ro = new ResizeObserver(report)
	ro.observe(el)
	report()
	return () => ro.disconnect()
}

// vim: ts=4
