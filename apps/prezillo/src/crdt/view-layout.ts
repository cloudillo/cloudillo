// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Derived canvas layout of views. Imports only types, so transforms can use it without a cycle.
 */

import type { LegacyStoredView, YPrezilloDocument } from './stored-types'

export const VIEW_GAP = 100

// Keyed on the shared Y map, not the wrapper: one Y.Doc can have several wrappers
const positionCache = new WeakMap<YPrezilloDocument['v'], Map<string, { x: number; y: number }>>()
const observedDocs = new WeakSet<YPrezilloDocument['v']>()

/**
 * Canvas positions of all views, derived from presentation order: a vertical stack at x = 0.
 * A doc still on the legacy layout (every view has x/y: read-only viewers never migrate it)
 * keeps its stored positions, so floating objects stay on their slides.
 * Cached per document (transforms call this for every object); any change to `vo` or `v`
 * drops the cache, since a slide's height moves everything below it.
 */
export function getViewPositions(doc: YPrezilloDocument): Map<string, { x: number; y: number }> {
	let positions = positionCache.get(doc.v)
	if (positions) return positions
	if (!observedDocs.has(doc.v)) {
		observedDocs.add(doc.v)
		const invalidate = () => {
			positionCache.delete(doc.v)
		}
		doc.vo.observe(invalidate)
		doc.v.observe(invalidate)
	}
	const views: Array<[string, LegacyStoredView]> = []
	for (const id of new Set(doc.vo.toArray())) {
		const view = doc.v.get(id)
		if (view) views.push([id, view])
	}
	const legacy =
		views.length > 0 &&
		views.every(([, v]) => typeof v.x === 'number' && typeof v.y === 'number')
	positions = new Map()
	let y = 0
	for (const [id, view] of views) {
		positions.set(id, legacy ? { x: view.x!, y: view.y! } : { x: 0, y })
		y += view.height + VIEW_GAP
	}
	positionCache.set(doc.v, positions)
	return positions
}

export function getViewOrigin(
	doc: YPrezilloDocument,
	viewId: string
): { x: number; y: number } | undefined {
	return getViewPositions(doc).get(viewId)
}

// vim: ts=4
