// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Time-grid event placement for overlap handling.
 *
 *  Given a set of intervals [start, end) within a single day, assign each
 *  one a `lane` index and the maximum concurrent lane count within its
 *  overlap cluster. Consumers then render the event at
 *      left  = lane / totalLanes * 100%
 *      width = 1 / totalLanes * 100%
 *  to pack N overlapping events into N side-by-side columns.
 */

export interface PlacedInterval<T> {
	item: T
	/** Column assigned within the overlap cluster. 0-based. */
	lane: number
	/** Width of that cluster. */
	totalLanes: number
}

export interface Interval<T> {
	start: number
	end: number
	item: T
}

export function placeIntervals<T>(intervals: Interval<T>[]): PlacedInterval<T>[] {
	if (intervals.length === 0) return []
	// Sort by start, then longest first at the same start so bigger events
	// take the left-most lane.
	const sorted = [...intervals].sort((a, b) => a.start - b.start || b.end - a.end)

	// Pass 1: lane assignment. `lanes[i]` = end time of the event in lane i.
	const laneEnds: number[] = []
	const lanesByIdx = new Map<Interval<T>, number>()
	for (const iv of sorted) {
		let lane = laneEnds.findIndex((end) => end <= iv.start)
		if (lane === -1) {
			lane = laneEnds.length
			laneEnds.push(iv.end)
		} else {
			laneEnds[lane] = iv.end
		}
		lanesByIdx.set(iv, lane)
	}

	// Pass 2: cluster discovery. Group consecutive overlapping events.
	// Within a cluster, `totalLanes` is the max lane index + 1.
	const out: PlacedInterval<T>[] = []
	let clusterStart = 0
	let clusterEndMax = -Infinity
	let clusterLanes = 0

	const flush = (fromIdx: number, toIdx: number, total: number) => {
		for (let i = fromIdx; i < toIdx; i++) {
			const iv = sorted[i]
			out.push({
				item: iv.item,
				lane: lanesByIdx.get(iv) ?? 0,
				totalLanes: total
			})
		}
	}

	for (let i = 0; i < sorted.length; i++) {
		const iv = sorted[i]
		if (iv.start >= clusterEndMax) {
			// Previous cluster closes.
			if (i > clusterStart) flush(clusterStart, i, clusterLanes)
			clusterStart = i
			clusterEndMax = iv.end
			clusterLanes = 1
		} else {
			clusterEndMax = Math.max(clusterEndMax, iv.end)
		}
		const lane = lanesByIdx.get(iv) ?? 0
		if (lane + 1 > clusterLanes) clusterLanes = lane + 1
	}
	flush(clusterStart, sorted.length, clusterLanes)

	return out
}

// vim: ts=4
