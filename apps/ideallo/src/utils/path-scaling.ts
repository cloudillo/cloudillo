// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { parseSvgPath } from './hit-testing.js'
import type { BezierSegment } from './hit-testing.js'
import type { Point } from './geometry.js'

export function scalePathData(pathData: string, scaleX: number, scaleY: number): string {
	if (scaleX === 1 && scaleY === 1) return pathData
	const parsed = parseSvgPath(pathData)
	if (parsed.segments.length === 0) return pathData

	const scalePoint = (p: Point): Point => [p[0] * scaleX, p[1] * scaleY]

	const scaled: BezierSegment[] = parsed.segments.map((seg) => ({
		start: scalePoint(seg.start),
		control1: scalePoint(seg.control1),
		control2: scalePoint(seg.control2),
		end: scalePoint(seg.end)
	}))

	const parts: string[] = []
	const fmt = (n: number) => +n.toFixed(2) + ''
	parts.push(`M${fmt(scaled[0].start[0])} ${fmt(scaled[0].start[1])}`)
	for (const s of scaled) {
		parts.push(
			`C${fmt(s.control1[0])} ${fmt(s.control1[1])} ` +
				`${fmt(s.control2[0])} ${fmt(s.control2[1])} ` +
				`${fmt(s.end[0])} ${fmt(s.end[1])}`
		)
	}
	if (parsed.closed) parts.push('Z')
	return parts.join('')
}
