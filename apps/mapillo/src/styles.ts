// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { TileSource } from '@cloudillo/core'
import type { StyleSpecification } from 'maplibre-gl'

import type { TileLayerConfig, TileLayerId } from './types.js'

type StyleHints = Omit<TileLayerConfig, 'id' | 'name' | 'url' | 'attribution'>

const DEFAULT_HINTS: StyleHints = {
	description: '',
	tileSize: 256,
	maxZoom: 19,
	skipDarkFilter: false,
	previewColor: '#c8c8c8'
}

/**
 * Display hints for well-known sources, keyed by the source name used in the
 * `map.tile_sources` server setting. URLs and attributions come from the setting only.
 */
const STYLE_HINTS: Record<string, Partial<StyleHints>> = {
	OpenStreetMap: { description: 'Standard map with labels', previewColor: '#aad3df' },
	Positron: {
		description: 'Clean, light, minimal',
		tileSize: 512,
		maxZoom: 20,
		previewColor: '#e6e5e3'
	},
	'Positron (No Labels)': {
		description: 'Light, no text',
		tileSize: 512,
		maxZoom: 20,
		previewColor: '#d5d4d2'
	},
	'Dark Matter': {
		description: 'Native dark theme',
		tileSize: 512,
		maxZoom: 20,
		skipDarkFilter: true,
		previewColor: '#2c2c2c'
	},
	Voyager: {
		description: 'Colorful, modern',
		tileSize: 512,
		maxZoom: 20,
		previewColor: '#e8e0d8'
	},
	OpenTopoMap: { description: 'Topographic contour lines', maxZoom: 17, previewColor: '#c5e8b0' },
	Satellite: { description: 'Aerial imagery', skipDarkFilter: true, previewColor: '#3a5a3a' }
}

/**
 * The attribution as safe HTML: text and `<a href="https://…">` links only. The setting is
 * admin-written, but maplibre renders it with innerHTML.
 */
export function sanitizeAttribution(html: string): string {
	const src = new DOMParser().parseFromString(html, 'text/html').body
	const out = document.createElement('div')
	for (const node of src.childNodes) {
		if (node instanceof HTMLAnchorElement) {
			const href = node.getAttribute('href') ?? ''
			if (href.startsWith('https://')) {
				const a = document.createElement('a')
				a.href = href
				a.rel = 'noopener noreferrer'
				a.textContent = node.textContent
				out.append(a)
				continue
			}
		}
		out.append(node.textContent ?? '')
	}
	return out.innerHTML
}

export function toTileLayers(sources: TileSource[]): TileLayerConfig[] {
	return sources.map((s) => ({
		...DEFAULT_HINTS,
		...STYLE_HINTS[s.name],
		id: s.name,
		name: s.name,
		url: s.url,
		attribution: sanitizeAttribution(s.attribution)
	}))
}

/** Layer ids persisted before the ids became the source names (`activeTileLayerId`) */
const LEGACY_LAYER_IDS: Record<string, string> = {
	'osm-standard': 'OpenStreetMap',
	'carto-positron': 'Positron',
	'carto-positron-nolabels': 'Positron (No Labels)',
	'carto-dark': 'Dark Matter',
	'carto-voyager': 'Voyager',
	opentopomap: 'OpenTopoMap',
	'esri-imagery': 'Satellite'
}

/** The layer with this id, else the first one (a persisted id the admin has since removed) */
export function getTileLayer(layers: TileLayerConfig[], id: TileLayerId): TileLayerConfig {
	const name = Object.hasOwn(LEGACY_LAYER_IDS, id) ? LEGACY_LAYER_IDS[id] : id
	return layers.find((l) => l.id === name) || layers[0]
}

export function getMapStyle(layer: TileLayerConfig): StyleSpecification {
	return {
		version: 8,
		sources: {
			'base-tiles': {
				type: 'raster',
				tiles: [layer.url],
				tileSize: layer.tileSize,
				maxzoom: layer.maxZoom,
				attribution: layer.attribution
			}
		},
		layers: [
			{
				id: 'base-tile-layer',
				type: 'raster',
				source: 'base-tiles',
				minzoom: 0
			}
		]
	}
}

// vim: ts=4
