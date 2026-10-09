// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Embed view nav for ideallo: which part of the board an embed shows.
 *
 * - `rect:x,y,w,h` — a canvas rectangle (canvas units)
 * - `frame:<id>` — a named frame (resolved by the app)
 * - `c=x,y;z=zoom` — legacy centre + zoom
 * - none / malformed — the whole board
 */

import { parseNav } from '@cloudillo/core'

export type IdealloNav =
	| { kind: 'rect'; x: number; y: number; w: number; h: number }
	| { kind: 'legacy'; cx: number; cy: number; zoom: number }
	| { kind: 'frame'; id: string }
	| { kind: 'board' }

export function parseIdealloNav(nav?: string): IdealloNav {
	if (!nav) return { kind: 'board' }
	const { kind, value } = parseNav(nav)

	if (kind === 'rect') {
		const [x, y, w, h] = value.split(',').map(Number)
		if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
			return { kind: 'rect', x, y, w, h }
		}
	} else if (kind === 'frame') {
		if (value) return { kind: 'frame', id: value }
	} else if (kind === '') {
		const params = Object.fromEntries(nav.split(';').map((p) => p.split('=')))
		const [cx, cy] = String(params.c ?? '')
			.split(',')
			.map(Number)
		const zoom = params.z === undefined ? 1 : Number(params.z)
		if (Number.isFinite(cx) && Number.isFinite(cy) && zoom > 0) {
			return { kind: 'legacy', cx, cy, zoom }
		}
	}
	return { kind: 'board' }
}

export function formatRectNav(r: { x: number; y: number; w: number; h: number }): string {
	return `rect:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`
}
