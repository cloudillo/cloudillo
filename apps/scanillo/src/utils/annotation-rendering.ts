// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Douglas-Peucker point simplification
export function simplifyPoints(points: [number, number][], tolerance: number): [number, number][] {
	if (points.length <= 2) return points

	let maxDist = 0
	let maxIdx = 0
	const first = points[0]
	const last = points[points.length - 1]

	for (let i = 1; i < points.length - 1; i++) {
		const dist = perpendicularDist(points[i], first, last)
		if (dist > maxDist) {
			maxDist = dist
			maxIdx = i
		}
	}

	if (maxDist > tolerance) {
		const left = simplifyPoints(points.slice(0, maxIdx + 1), tolerance)
		const right = simplifyPoints(points.slice(maxIdx), tolerance)
		return [...left.slice(0, -1), ...right]
	}

	return [first, last]
}

function perpendicularDist(
	point: [number, number],
	lineStart: [number, number],
	lineEnd: [number, number]
): number {
	const dx = lineEnd[0] - lineStart[0]
	const dy = lineEnd[1] - lineStart[1]
	const lenSq = dx * dx + dy * dy

	if (lenSq === 0) return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1])

	const t = Math.max(
		0,
		Math.min(1, ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq)
	)
	const projX = lineStart[0] + t * dx
	const projY = lineStart[1] + t * dy
	return Math.hypot(point[0] - projX, point[1] - projY)
}

// vim: ts=4
