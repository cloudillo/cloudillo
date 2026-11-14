// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Helpers for canvas objects whose stored type this client does not know (written by a newer
 * client). Apps expand them into a placeholder that keeps the raw record, and compact only
 * the fields the placeholder can change back into it.
 */

/** `v` when it is a finite number, else `fallback` */
export function finiteOr(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Fields an unknown-object placeholder can change */
export interface UnknownPlaceholder {
	raw: Record<string, unknown>
	x: number
	y: number
	width: number
	height: number
	rotation: number
	pivotX: number
	pivotY: number
}

/** Geometry read from a raw record: `xy`/`wh`/`pv` only when they are arrays, else defaults */
export function readUnknownGeometry(raw: Record<string, unknown>) {
	const xy = Array.isArray(raw.xy) ? raw.xy : []
	const wh = Array.isArray(raw.wh) ? raw.wh : []
	const pv = Array.isArray(raw.pv) ? raw.pv : []
	return {
		x: finiteOr(xy[0], 0),
		y: finiteOr(xy[1], 0),
		width: finiteOr(wh[0], 100),
		height: finiteOr(wh[1], 100),
		rotation: finiteOr(raw.r, 0),
		pivotX: finiteOr(pv[0], 0.5),
		pivotY: finiteOr(pv[1], 0.5)
	}
}

function sameValue(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => v === b[i])
	}
	return a === b
}

/**
 * Write `value` to `stored[key]` only when it differs from what was read back from the raw
 * record (arrays compare element-wise), deleting the key when it is the default. Writing back
 * only what the user changed keeps an untouched record byte-identical.
 */
export function setIfChanged(
	stored: Record<string, unknown>,
	key: string,
	value: unknown,
	readBack: unknown,
	isDefault: (v: unknown) => boolean
): void {
	if (sameValue(value, readBack)) return
	if (isDefault(value)) delete stored[key]
	else stored[key] = value
}

/**
 * Copy of `obj.raw` with the placeholder's position, size, rotation and pivot written back, but
 * only what changed; `wh` is never invented. An unchanged record comes back key-for-key identical.
 */
export function compactUnknownRecord(obj: UnknownPlaceholder): Record<string, unknown> {
	const stored: Record<string, unknown> = { ...obj.raw }
	const read = readUnknownGeometry(obj.raw)
	if (obj.x !== read.x || obj.y !== read.y) stored.xy = [obj.x, obj.y]
	if (Array.isArray(obj.raw.wh) && (obj.width !== read.width || obj.height !== read.height)) {
		stored.wh = [obj.width, obj.height]
	}
	setIfChanged(stored, 'r', obj.rotation, read.rotation, (v) => v === 0)
	setIfChanged(
		stored,
		'pv',
		[obj.pivotX, obj.pivotY],
		[read.pivotX, read.pivotY],
		() => obj.pivotX === 0.5 && obj.pivotY === 0.5
	)
	return stored
}

// vim: ts=4
