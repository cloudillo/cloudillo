// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { N_ } from '@cloudillo/react'

export interface NominatimResult {
	place_id: number
	licence: string
	osm_type: string
	osm_id: number
	lat: string
	lon: string
	display_name: string
	type: string
	importance: number
	boundingbox: [string, string, string, string]
}

/** A tile source's name; the sources come from the `map.tile_sources` server setting */
export type TileLayerId = string

export interface TileLayerConfig {
	id: TileLayerId
	name: string
	description: string
	url: string
	attribution: string
	tileSize: number
	maxZoom: number
	skipDarkFilter: boolean
	previewColor: string
}

export interface PoiFeature {
	lat: number
	lon: number
	name: string
	tags: Record<string, string>
}

export type PoiCategory =
	| 'restaurant'
	| 'fast_food'
	| 'cafe'
	| 'bar'
	| 'supermarket'
	| 'convenience'
	| 'bakery'
	| 'clothes'
	| 'marketplace'
	| 'pharmacy'
	| 'hospital'
	| 'doctor'
	| 'dentist'
	| 'hotel'
	| 'museum'
	| 'attraction'
	| 'viewpoint'
	| 'park'
	| 'playground'
	| 'fuel'
	| 'parking'
	| 'ev_charging'
	| 'bus_station'
	| 'train_station'
	| 'atm'
	| 'bank'
	| 'post_office'
	| 'police'
	| 'toilets'
	| 'drinking_water'
	| 'library'

export interface PoiCategoryInfo {
	overpassTags: string[]
	label: string
	color: string
}

export const POI_CATEGORIES: Record<PoiCategory, PoiCategoryInfo> = {
	// Food & Drink
	restaurant: {
		overpassTags: ['["amenity"="restaurant"]'],
		label: N_('Restaurants'),
		color: '#e8555a'
	},
	fast_food: {
		overpassTags: ['["amenity"="fast_food"]'],
		label: N_('Fast Food'),
		color: '#e87d3e'
	},
	cafe: { overpassTags: ['["amenity"="cafe"]'], label: N_('Cafes'), color: '#a0522d' },
	bar: {
		overpassTags: ['["amenity"="bar"]', '["amenity"="pub"]'],
		label: N_('Bars & Pubs'),
		color: '#c44dff'
	},
	// Shopping
	supermarket: {
		overpassTags: ['["shop"="supermarket"]'],
		label: N_('Supermarkets'),
		color: '#2196f3'
	},
	convenience: {
		overpassTags: ['["shop"="convenience"]'],
		label: N_('Convenience'),
		color: '#26a69a'
	},
	bakery: { overpassTags: ['["shop"="bakery"]'], label: N_('Bakeries'), color: '#8d6e63' },
	clothes: { overpassTags: ['["shop"="clothes"]'], label: N_('Clothing'), color: '#5c6bc0' },
	marketplace: {
		overpassTags: ['["amenity"="marketplace"]'],
		label: N_('Markets'),
		color: '#00897b'
	},
	// Health
	pharmacy: {
		overpassTags: ['["amenity"="pharmacy"]'],
		label: N_('Pharmacies'),
		color: '#4caf50'
	},
	hospital: {
		overpassTags: ['["amenity"="hospital"]'],
		label: N_('Hospitals'),
		color: '#e53935'
	},
	doctor: {
		overpassTags: ['["amenity"="doctors"]', '["amenity"="clinic"]'],
		label: N_('Doctors'),
		color: '#43a047'
	},
	dentist: { overpassTags: ['["amenity"="dentist"]'], label: N_('Dentists'), color: '#66bb6a' },
	// Tourism & Leisure
	hotel: {
		overpassTags: ['["tourism"="hotel"]', '["tourism"="hostel"]'],
		label: N_('Hotels'),
		color: '#ff9800'
	},
	museum: { overpassTags: ['["tourism"="museum"]'], label: N_('Museums'), color: '#795548' },
	attraction: {
		overpassTags: ['["tourism"="attraction"]'],
		label: N_('Attractions'),
		color: '#ffc107'
	},
	viewpoint: {
		overpassTags: ['["tourism"="viewpoint"]'],
		label: N_('Viewpoints'),
		color: '#607d8b'
	},
	park: { overpassTags: ['["leisure"="park"]'], label: N_('Parks'), color: '#388e3c' },
	playground: {
		overpassTags: ['["leisure"="playground"]'],
		label: N_('Playgrounds'),
		color: '#8bc34a'
	},
	// Transport
	fuel: { overpassTags: ['["amenity"="fuel"]'], label: N_('Fuel Stations'), color: '#455a64' },
	parking: { overpassTags: ['["amenity"="parking"]'], label: N_('Parking'), color: '#78909c' },
	ev_charging: {
		overpassTags: ['["amenity"="charging_station"]'],
		label: N_('EV Charging'),
		color: '#00bcd4'
	},
	bus_station: {
		overpassTags: ['["amenity"="bus_station"]', '["highway"="bus_stop"]'],
		label: N_('Bus Stations'),
		color: '#3f51b5'
	},
	train_station: {
		overpassTags: ['["railway"="station"]'],
		label: N_('Train Stations'),
		color: '#1a237e'
	},
	// Finance
	atm: { overpassTags: ['["amenity"="atm"]'], label: N_('ATMs'), color: '#2e7d32' },
	bank: { overpassTags: ['["amenity"="bank"]'], label: N_('Banks'), color: '#1b5e20' },
	// Services
	post_office: {
		overpassTags: ['["amenity"="post_office"]'],
		label: N_('Post Offices'),
		color: '#f44336'
	},
	police: { overpassTags: ['["amenity"="police"]'], label: N_('Police'), color: '#1565c0' },
	toilets: { overpassTags: ['["amenity"="toilets"]'], label: N_('Toilets'), color: '#757575' },
	drinking_water: {
		overpassTags: ['["amenity"="drinking_water"]'],
		label: N_('Drinking Water'),
		color: '#0288d1'
	},
	library: { overpassTags: ['["amenity"="library"]'], label: N_('Libraries'), color: '#6a1b9a' }
}

export type PoiGroupId =
	| 'food_drink'
	| 'shopping'
	| 'health'
	| 'tourism'
	| 'transport'
	| 'finance'
	| 'services'

export interface PoiGroup {
	id: PoiGroupId
	label: string
	categories: PoiCategory[]
}

export const POI_GROUPS: PoiGroup[] = [
	{
		id: 'food_drink',
		label: N_('Food & Drink'),
		categories: ['restaurant', 'fast_food', 'cafe', 'bar']
	},
	{
		id: 'shopping',
		label: N_('Shopping'),
		categories: ['supermarket', 'convenience', 'bakery', 'clothes', 'marketplace']
	},
	{
		id: 'health',
		label: N_('Health'),
		categories: ['pharmacy', 'hospital', 'doctor', 'dentist']
	},
	{
		id: 'tourism',
		label: N_('Tourism & Leisure'),
		categories: ['hotel', 'museum', 'attraction', 'viewpoint', 'park', 'playground']
	},
	{
		id: 'transport',
		label: N_('Transport'),
		categories: ['fuel', 'parking', 'ev_charging', 'bus_station', 'train_station']
	},
	{ id: 'finance', label: N_('Finance'), categories: ['atm', 'bank'] },
	{
		id: 'services',
		label: N_('Services'),
		categories: ['post_office', 'police', 'toilets', 'drinking_water', 'library']
	}
]

// ============================================
// Overpass servers
// ============================================

export type OverpassServer = 'overpass-de' | 'overpass-private-coffee'

export const OVERPASS_SERVERS: Record<OverpassServer, { label: string; url: string }> = {
	'overpass-de': {
		label: N_('overpass-api.de (default)'),
		url: 'https://overpass-api.de/api/interpreter'
	},
	'overpass-private-coffee': {
		label: 'overpass.private.coffee',
		url: 'https://overpass.private.coffee/api/interpreter'
	}
}

// ============================================
// Mapillo settings
// ============================================

export interface MapilloSettings {
	activeTileLayerId: TileLayerId
	nominatimConsent: boolean
	overpassConsent: boolean
	overpassServer: OverpassServer
}

export const DEFAULT_SETTINGS: MapilloSettings = {
	// None chosen: the first configured source
	activeTileLayerId: '',
	nominatimConsent: false,
	overpassConsent: false,
	overpassServer: 'overpass-de'
}

// vim: ts=4
