// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilard Hajba
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

import type { StyleSpecification } from 'maplibre-gl'
import type { TileLayerId, TileLayerConfig } from './types.js'

export const TILE_LAYERS: TileLayerConfig[] = [
	{
		id: 'osm-standard',
		name: 'OpenStreetMap',
		description: 'Standard map with labels',
		url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		tileSize: 256,
		maxZoom: 19,
		skipDarkFilter: false,
		previewColor: '#aad3df'
	},
	{
		id: 'carto-positron',
		name: 'Positron',
		description: 'Clean, light, minimal',
		url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
		tileSize: 512,
		maxZoom: 20,
		skipDarkFilter: false,
		previewColor: '#e6e5e3'
	},
	{
		id: 'carto-positron-nolabels',
		name: 'Positron (No Labels)',
		description: 'Light, no text',
		url: 'https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
		tileSize: 512,
		maxZoom: 20,
		skipDarkFilter: false,
		previewColor: '#d5d4d2'
	},
	{
		id: 'carto-dark',
		name: 'Dark Matter',
		description: 'Native dark theme',
		url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
		tileSize: 512,
		maxZoom: 20,
		skipDarkFilter: true,
		previewColor: '#2c2c2c'
	},
	{
		id: 'carto-voyager',
		name: 'Voyager',
		description: 'Colorful, modern',
		url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
		tileSize: 512,
		maxZoom: 20,
		skipDarkFilter: false,
		previewColor: '#e8e0d8'
	},
	{
		id: 'opentopomap',
		name: 'OpenTopoMap',
		description: 'Topographic contour lines',
		url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
		tileSize: 256,
		maxZoom: 17,
		skipDarkFilter: false,
		previewColor: '#c5e8b0'
	},
	{
		id: 'esri-imagery',
		name: 'Satellite',
		description: 'Esri aerial imagery',
		url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
		attribution:
			'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
		tileSize: 256,
		maxZoom: 19,
		skipDarkFilter: true,
		previewColor: '#3a5a3a'
	}
]

export const DEFAULT_TILE_LAYER: TileLayerId = 'osm-standard'

export function getTileLayer(id: TileLayerId): TileLayerConfig {
	return TILE_LAYERS.find((l) => l.id === id) || TILE_LAYERS[0]
}

export function getMapStyle(tileId?: TileLayerId): StyleSpecification {
	const layer = getTileLayer(tileId || DEFAULT_TILE_LAYER)
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
