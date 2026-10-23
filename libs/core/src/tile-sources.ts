// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** One entry of the `map.tile_sources` server setting */
export interface TileSource {
	name: string
	url: string
	attribution: string
}

/**
 * The usable entries of a `map.tile_sources` value; anything malformed or not https (the backend
 * validator's rule) is dropped, and so is a repeated name (the name is the layer id), keeping the first.
 */
export function parseTileSources(value: unknown): TileSource[] {
	if (!Array.isArray(value)) return []
	const seen = new Set<string>()
	return value.filter((s): s is TileSource => {
		const ok =
			typeof s === 'object' &&
			s !== null &&
			typeof s.name === 'string' &&
			typeof s.url === 'string' &&
			s.url.startsWith('https://') &&
			typeof s.attribution === 'string' &&
			!seen.has(s.name)
		if (ok) seen.add(s.name)
		return ok
	})
}

// vim: ts=4
