// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PoiFeature, PoiCategory } from './types.js'
import { POI_CATEGORIES, OVERPASS_SERVERS } from './types.js'

const DEFAULT_OVERPASS_URL = OVERPASS_SERVERS['overpass-de'].url

export interface OverpassBounds {
	south: number
	west: number
	north: number
	east: number
}

interface OverpassElement {
	type: 'node' | 'way' | 'relation'
	id: number
	lat?: number
	lon?: number
	center?: { lat: number; lon: number }
	tags?: Record<string, string>
}

export async function queryOverpassPois(
	bounds: OverpassBounds,
	category: PoiCategory,
	overpassUrl?: string
): Promise<PoiFeature[]> {
	const cat = POI_CATEGORIES[category]
	const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`

	const tagUnion = cat.overpassTags
		.map((tag) => `node${tag}(${bbox});way${tag}(${bbox});`)
		.join('')
	const query = `[out:json][timeout:10];(${tagUnion});out center 50;`

	const res = await fetch(overpassUrl || DEFAULT_OVERPASS_URL, {
		method: 'POST',
		body: `data=${encodeURIComponent(query)}`,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
	})

	if (!res.ok) throw new Error(`Overpass API error: ${res.status}`)

	const data: { elements: OverpassElement[] } = await res.json()

	return data.elements
		.map((el) => {
			const lat = el.lat ?? el.center?.lat
			const lon = el.lon ?? el.center?.lon
			if (lat == null || lon == null) return null

			return {
				lat,
				lon,
				name: el.tags?.name || '',
				tags: el.tags || {}
			} satisfies PoiFeature
		})
		.filter((f): f is PoiFeature => f !== null)
}

// vim: ts=4
