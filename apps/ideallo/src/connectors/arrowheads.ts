// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Arrowhead geometry - the single place head shapes are defined. ShapeRenderer, ShapePreview,
 * GhostShapes and the PropertyBar swatches all render through this, so a picker cell cannot
 * disagree with the canvas.
 */

import type { ArrowStyle, Dir } from '../crdt/index.js'
import { hypot } from '../utils/geometry.js'

type Pt = [number, number]

export interface ArrowheadGeometry {
	/** SVG path data, already positioned and oriented in world space */
	d: string
	/** Whether the path should be filled with the stroke colour or left open */
	filled: boolean
	/**
	 * How far short of the tip the line should stop, so a filled head does not have a stroke
	 * poking out through its point.
	 */
	insetLength: number
}

/** Half-angle of the open V, matching the pre-connector renderer */
const HEAD_ANGLE = Math.PI / 6

/** Unit vectors for the four cardinal directions, in screen space (y grows downwards) */
const DIR_VECTOR: Record<Dir, Pt> = {
	n: [0, -1],
	s: [0, 1],
	e: [1, 0],
	w: [-1, 0]
}

export function dirToVector(dir: Dir): Pt {
	return DIR_VECTOR[dir]
}

/**
 * Base length of a head, before the style's size multiplier.
 * Keeps the historical formula so existing documents render unchanged.
 */
export function arrowheadBaseLength(style: ArrowStyle, strokeWidth: number): number {
	return Math.max(12, strokeWidth * 4) * (style.size ?? 1)
}

function round(n: number): number {
	return Math.round(n * 100) / 100
}

/**
 * Build the head geometry at `at`, pointing along `dir`.
 *
 * `dir` is the OUTGOING direction at the tip - the direction the connector is travelling as it
 * arrives, so a head at the end of a rightward arrow gets [1, 0]. Returns null for 'none'.
 */
export function arrowheadGeometry(
	style: ArrowStyle | undefined,
	at: Pt,
	dir: Pt,
	strokeWidth: number
): ArrowheadGeometry | null {
	if (!style || style.type === 'none') return null
	const len = hypot(dir[0], dir[1])
	if (len < 1e-9) return null

	const ux = dir[0] / len
	const uy = dir[1] / len
	const size = arrowheadBaseLength(style, strokeWidth)
	const filled = style.filled ?? true
	const [tx, ty] = at

	// Point at `distance` back along the line from the tip, offset `side` perpendicular
	const back = (distance: number, side: number): Pt => [
		round(tx - distance * ux - side * uy),
		round(ty - distance * uy + side * ux)
	]

	switch (style.type) {
		case 'arrow': {
			// Open V - two strokes meeting at the tip, never filled
			const a = back(size * Math.cos(HEAD_ANGLE), -size * Math.sin(HEAD_ANGLE))
			const b = back(size * Math.cos(HEAD_ANGLE), size * Math.sin(HEAD_ANGLE))
			return {
				d: `M ${a[0]} ${a[1]} L ${round(tx)} ${round(ty)} L ${b[0]} ${b[1]}`,
				filled: false,
				// The line runs all the way to the tip and is hidden by the V's own strokes
				insetLength: 0
			}
		}
		case 'triangle': {
			const halfWidth = size * 0.4
			const a = back(size, -halfWidth)
			const b = back(size, halfWidth)
			return {
				d: `M ${round(tx)} ${round(ty)} L ${a[0]} ${a[1]} L ${b[0]} ${b[1]} Z`,
				filled,
				insetLength: arrowheadInset(style, strokeWidth)
			}
		}
		case 'diamond': {
			const halfWidth = size * 0.32
			const a = back(size / 2, -halfWidth)
			const b = back(size, 0)
			const c = back(size / 2, halfWidth)
			return {
				d: `M ${round(tx)} ${round(ty)} L ${a[0]} ${a[1]} L ${b[0]} ${b[1]} L ${c[0]} ${c[1]} Z`,
				filled,
				insetLength: arrowheadInset(style, strokeWidth)
			}
		}
		case 'circle': {
			const r = size * 0.35
			// Seated just behind the tip so the circle's edge touches the terminal point
			const c = back(r, 0)
			return {
				d:
					`M ${round(c[0] - r)} ${round(c[1])} ` +
					`a ${round(r)} ${round(r)} 0 1 0 ${round(r * 2)} 0 ` +
					`a ${round(r)} ${round(r)} 0 1 0 ${round(-r * 2)} 0 Z`,
				filled,
				insetLength: arrowheadInset(style, strokeWidth)
			}
		}
		case 'bar': {
			const half = size * 0.4
			const a = back(0, -half)
			const b = back(0, half)
			return {
				d: `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`,
				filled: false,
				insetLength: 0
			}
		}
		default:
			return null
	}
}

/**
 * How far short of the tip the line should stop at this terminal.
 * Direction-independent, so a router can apply it before it knows the final segment angle.
 */
export function arrowheadInset(style: ArrowStyle | undefined, strokeWidth: number): number {
	if (!style || style.type === 'none') return 0
	const filled = style.filled ?? true
	const size = arrowheadBaseLength(style, strokeWidth)
	switch (style.type) {
		case 'triangle':
		case 'diamond':
			return filled ? size * 0.9 : 0
		case 'circle':
			return filled ? size * 0.35 * 2 : 0
		default:
			// The open V and the bar are strokes drawn over the line; nothing to hide
			return 0
	}
}

/**
 * How far a head extends past its terminal point in any direction.
 * Route bounds are grown by this so a selection box never clips a large filled head.
 */
export function arrowheadExtent(style: ArrowStyle | undefined, strokeWidth: number): number {
	if (!style || style.type === 'none') return 0
	return arrowheadBaseLength(style, strokeWidth)
}

// vim: ts=4
