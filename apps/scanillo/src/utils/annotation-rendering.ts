// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
