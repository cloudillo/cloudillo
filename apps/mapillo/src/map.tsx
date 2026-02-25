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

import * as React from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
	LuCompass as IcCompass,
	LuLocate as IcLocate,
	LuLoader as IcLoading,
	LuNavigation as IcNorth
} from 'react-icons/lu'
import type { AppMessageBus } from '@cloudillo/core'

import { getMapStyle, getTileLayer } from './styles.js'
import { SearchBar } from './search.js'
import { PoiPanel } from './poi.js'
import { LayerPanel } from './layers.js'
import { SettingsPanel } from './settings.js'
import { queryOverpassPois } from './overpass.js'
import { OVERPASS_SERVERS, POI_CATEGORIES } from './types.js'
import type {
	NominatimResult,
	PoiFeature,
	PoiCategory,
	TileLayerId,
	MapilloSettings
} from './types.js'

interface MapViewProps {
	darkMode: boolean
	settings: MapilloSettings
	onSettingsChange: (changes: Partial<MapilloSettings>) => void
	bus: AppMessageBus | null
}

export function MapView({ darkMode, settings, onSettingsChange, bus }: MapViewProps) {
	const mapContainerRef = React.useRef<HTMLDivElement>(null)
	const mapRef = React.useRef<maplibregl.Map | null>(null)
	const searchMarkerRef = React.useRef<maplibregl.Marker | null>(null)
	const poiMarkersRef = React.useRef<maplibregl.Marker[]>([])
	const locationMarkerRef = React.useRef<maplibregl.Marker | null>(null)
	const [locating, setLocating] = React.useState(false)
	const [freeRotation, setFreeRotation] = React.useState(false)
	const [bearing, setBearing] = React.useState(0)
	const [activePanel, setActivePanel] = React.useState<'layers' | 'poi' | 'settings' | null>(null)

	const activeTileId = settings.activeTileLayerId

	// Initialize map (synchronous — raster tiles don't need worker)
	React.useEffect(() => {
		if (!mapContainerRef.current) return

		const map = new maplibregl.Map({
			container: mapContainerRef.current,
			style: getMapStyle(activeTileId),
			maxZoom: getTileLayer(activeTileId).maxZoom,
			center: [0, 20],
			zoom: 2
		})

		map.dragRotate.disable()
		map.touchZoomRotate.disableRotation()
		map.on('rotate', () => setBearing(map.getBearing()))

		map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
		mapRef.current = map

		return () => {
			map.remove()
			mapRef.current = null
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Handle dark mode toggle via CSS filter
	React.useEffect(() => {
		const el = mapContainerRef.current
		if (!el) return
		const layer = getTileLayer(activeTileId)
		if (darkMode && !layer.skipDarkFilter) {
			el.classList.add('dark-mode')
		} else {
			el.classList.remove('dark-mode')
		}
	}, [darkMode, activeTileId])

	// Handle tile layer change
	const handleTileChange = React.useCallback(
		(id: TileLayerId) => {
			onSettingsChange({ activeTileLayerId: id })
			const map = mapRef.current
			if (!map) return
			const layer = getTileLayer(id)
			map.setMaxZoom(layer.maxZoom)
			if (map.getZoom() > layer.maxZoom) {
				map.setZoom(layer.maxZoom)
			}
			map.setStyle(getMapStyle(id))
		},
		[onSettingsChange]
	)

	// Subscribe to compass heading via message bus
	React.useEffect(() => {
		if (!freeRotation) return
		const map = mapRef.current
		if (!map || !bus) return

		// Track user drag state via events (not isMoving which resets on setBearing)
		let userDragging = false
		const onDragStart = () => {
			userDragging = true
		}
		const onDragEnd = () => {
			userDragging = false
		}
		map.on('dragstart', onDragStart)
		map.on('dragend', onDragEnd)

		bus.subscribeCompass((heading) => {
			if (userDragging || map.isEasing()) return
			// Write directly to transform to avoid stop() cancelling drag/animations
			map.transform.setBearing(heading)
			map.triggerRepaint()
			setBearing(heading)
		}).catch((err) => {
			console.warn('[Mapillo] Compass subscription failed:', err)
		})

		return () => {
			map.off('dragstart', onDragStart)
			map.off('dragend', onDragEnd)
			bus.unsubscribeCompass().catch(() => {})
		}
	}, [freeRotation, bus])

	// Toggle compass tracking
	const handleRotationToggle = React.useCallback(() => {
		const map = mapRef.current
		if (!map) return
		if (freeRotation) {
			map.rotateTo(0, { duration: 500 })
			setFreeRotation(false)
		} else {
			setFreeRotation(true)
		}
	}, [freeRotation])

	// Jump to current location
	const handleLocate = React.useCallback(() => {
		if (!navigator.geolocation) return

		setLocating(true)
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const map = mapRef.current
				if (!map) {
					setLocating(false)
					return
				}

				const { longitude, latitude } = pos.coords

				// Remove previous location marker
				if (locationMarkerRef.current) {
					locationMarkerRef.current.remove()
				}

				// Create a pulsing dot element for the marker
				const el = document.createElement('div')
				el.className = 'mapillo-location-dot'

				const marker = new maplibregl.Marker({ element: el })
					.setLngLat([longitude, latitude])
					.addTo(map)

				locationMarkerRef.current = marker

				// Fly to location
				map.flyTo({
					center: [longitude, latitude],
					zoom: Math.max(map.getZoom(), 15),
					duration: 1500
				})

				setLocating(false)
			},
			(err) => {
				console.error('[Mapillo] Geolocation error:', err)
				setLocating(false)
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		)
	}, [])

	// Handle search result selection
	const handleSearchSelect = React.useCallback((result: NominatimResult) => {
		const map = mapRef.current
		if (!map) return

		const lng = parseFloat(result.lon)
		const lat = parseFloat(result.lat)

		// Remove previous search marker
		if (searchMarkerRef.current) {
			searchMarkerRef.current.remove()
		}

		// Fly to location
		const [south, north, west, east] = result.boundingbox.map(Number)
		map.fitBounds(
			[
				[west, south],
				[east, north]
			],
			{ padding: 50, maxZoom: 17, duration: 1500 }
		)

		// Place marker
		const marker = new maplibregl.Marker({ color: '#e74c3c' })
			.setLngLat([lng, lat])
			.setPopup(
				new maplibregl.Popup({ offset: 25 }).setHTML(
					`<div class="mapillo-popup">${escapeHtml(result.display_name)}</div>`
				)
			)
			.addTo(map)

		marker.togglePopup()
		searchMarkerRef.current = marker
	}, [])

	// Handle POI results
	const handlePoiResults = React.useCallback((pois: PoiFeature[], category: PoiCategory) => {
		const map = mapRef.current
		if (!map) return

		// Clear previous POI markers
		for (const marker of poiMarkersRef.current) {
			marker.remove()
		}
		poiMarkersRef.current = []

		const color = POI_CATEGORIES[category]?.color || '#e8555a'

		// Add new markers with staggered animation
		pois.forEach((poi, i) => {
			const popup = new maplibregl.Popup({ offset: 14, maxWidth: '250px' }).setHTML(
				formatPoiPopup(poi)
			)

			const el = document.createElement('div')
			el.className = 'mapillo-poi-marker'
			// Inner dot element so animation doesn't conflict with MapLibre's transform
			const dot = document.createElement('div')
			dot.className = 'mapillo-poi-dot'
			dot.style.setProperty('--poi-color', color)
			// Stagger animation so markers don't all pulse in sync
			dot.style.animationDelay = `${(i % 5) * 0.4}s`
			el.appendChild(dot)

			const marker = new maplibregl.Marker({ element: el })
				.setLngLat([poi.lon, poi.lat])
				.setPopup(popup)
				.addTo(map)

			poiMarkersRef.current.push(marker)
		})
	}, [])

	// Query POIs via Overpass API
	const queryPois = React.useCallback(
		async (category: PoiCategory): Promise<PoiFeature[]> => {
			const map = mapRef.current
			if (!map) return []

			if (map.getZoom() < 13) {
				throw new Error('Zoom in closer to search for places')
			}

			const bounds = map.getBounds()
			const overpassUrl = OVERPASS_SERVERS[settings.overpassServer]?.url
			return queryOverpassPois(
				{
					south: bounds.getSouth(),
					west: bounds.getWest(),
					north: bounds.getNorth(),
					east: bounds.getEast()
				},
				category,
				overpassUrl
			)
		},
		[settings.overpassServer]
	)

	// Privacy consent handlers
	const handleNominatimConsent = React.useCallback(() => {
		onSettingsChange({ nominatimConsent: true })
	}, [onSettingsChange])

	const handleOverpassConsent = React.useCallback(() => {
		onSettingsChange({ overpassConsent: true })
	}, [onSettingsChange])

	return (
		<div className="mapillo-app">
			<SearchBar
				onSelect={handleSearchSelect}
				privacyAcknowledged={settings.nominatimConsent}
				onPrivacyAcknowledge={handleNominatimConsent}
			/>
			<LayerPanel
				activeTileId={activeTileId}
				onSelect={handleTileChange}
				open={activePanel === 'layers'}
				onToggle={(v) => setActivePanel(v ? 'layers' : null)}
			/>
			<PoiPanel
				onResults={handlePoiResults}
				queryPois={queryPois}
				privacyAcknowledged={settings.overpassConsent}
				onPrivacyAcknowledge={handleOverpassConsent}
				open={activePanel === 'poi'}
				onToggle={(v) => setActivePanel(v ? 'poi' : null)}
			/>
			<SettingsPanel
				settings={settings}
				onSettingsChange={onSettingsChange}
				open={activePanel === 'settings'}
				onToggle={(v) => setActivePanel(v ? 'settings' : null)}
			/>
			<button
				className="mapillo-compass"
				onClick={handleRotationToggle}
				title={freeRotation ? 'Lock north' : 'Free rotation'}
			>
				{freeRotation ? (
					<IcCompass style={{ transform: `rotate(${-bearing}deg)` }} />
				) : (
					<IcNorth />
				)}
			</button>
			<button
				className={`mapillo-locate ${locating ? 'locating' : ''}`}
				onClick={handleLocate}
				disabled={locating}
				title="Jump to my location"
			>
				{locating ? <IcLoading className="mapillo-spin" /> : <IcLocate />}
			</button>
			<div ref={mapContainerRef} className="mapillo-map" />
		</div>
	)
}

function formatPoiPopup(poi: PoiFeature): string {
	const tags = poi.tags
	const name = poi.name || tags.amenity || tags.shop || tags.leisure || 'POI'

	// Type line from amenity/shop/leisure/tourism
	const typeTag = tags.amenity || tags.shop || tags.leisure || tags.tourism || ''
	const typeLine = typeTag
		? `<div class="mapillo-popup-type">${escapeHtml(typeTag.replace(/_/g, ' '))}</div>`
		: ''

	const fields: string[] = []

	// Cuisine
	if (tags.cuisine) {
		fields.push(
			`<div class="mapillo-popup-field"><span class="mapillo-popup-label">Cuisine:</span> ${escapeHtml(tags.cuisine.replace(/;/g, ', '))}</div>`
		)
	}

	// Collapsed address
	const street = tags['addr:street']
	const houseNum = tags['addr:housenumber']
	const city = tags['addr:city']
	const postcode = tags['addr:postcode']
	const addrParts: string[] = []
	if (street) addrParts.push(houseNum ? `${street} ${houseNum}` : street)
	if (city) addrParts.push(postcode ? `${city} ${postcode}` : city)
	if (addrParts.length) {
		fields.push(
			`<div class="mapillo-popup-field mapillo-popup-addr">${escapeHtml(addrParts.join(', '))}</div>`
		)
	}

	// Opening hours
	if (tags.opening_hours) {
		fields.push(
			`<div class="mapillo-popup-field"><span class="mapillo-popup-label">Hours:</span> ${escapeHtml(tags.opening_hours)}</div>`
		)
	}

	// Phone
	if (tags.phone) {
		fields.push(
			`<div class="mapillo-popup-field"><span class="mapillo-popup-label">Phone:</span> ${escapeHtml(tags.phone)}</div>`
		)
	}

	// Website
	if (tags.website) {
		const url = escapeHtml(tags.website)
		const display = escapeHtml(
			tags.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
		)
		fields.push(
			`<div class="mapillo-popup-field"><a href="${url}" target="_blank" rel="noopener noreferrer">${display}</a></div>`
		)
	}

	return `<div class="mapillo-popup"><b>${escapeHtml(name)}</b>${typeLine}${fields.join('')}</div>`
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

// vim: ts=4
