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

export type TileLayerId =
	| 'osm-standard'
	| 'carto-positron'
	| 'carto-positron-nolabels'
	| 'carto-dark'
	| 'carto-voyager'
	| 'opentopomap'
	| 'esri-imagery'

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
		label: 'Restaurants',
		color: '#e8555a'
	},
	fast_food: { overpassTags: ['["amenity"="fast_food"]'], label: 'Fast Food', color: '#e87d3e' },
	cafe: { overpassTags: ['["amenity"="cafe"]'], label: 'Cafes', color: '#a0522d' },
	bar: {
		overpassTags: ['["amenity"="bar"]', '["amenity"="pub"]'],
		label: 'Bars & Pubs',
		color: '#c44dff'
	},
	// Shopping
	supermarket: {
		overpassTags: ['["shop"="supermarket"]'],
		label: 'Supermarkets',
		color: '#2196f3'
	},
	convenience: {
		overpassTags: ['["shop"="convenience"]'],
		label: 'Convenience',
		color: '#26a69a'
	},
	bakery: { overpassTags: ['["shop"="bakery"]'], label: 'Bakeries', color: '#8d6e63' },
	clothes: { overpassTags: ['["shop"="clothes"]'], label: 'Clothing', color: '#5c6bc0' },
	marketplace: {
		overpassTags: ['["amenity"="marketplace"]'],
		label: 'Markets',
		color: '#00897b'
	},
	// Health
	pharmacy: { overpassTags: ['["amenity"="pharmacy"]'], label: 'Pharmacies', color: '#4caf50' },
	hospital: { overpassTags: ['["amenity"="hospital"]'], label: 'Hospitals', color: '#e53935' },
	doctor: {
		overpassTags: ['["amenity"="doctors"]', '["amenity"="clinic"]'],
		label: 'Doctors',
		color: '#43a047'
	},
	dentist: { overpassTags: ['["amenity"="dentist"]'], label: 'Dentists', color: '#66bb6a' },
	// Tourism & Leisure
	hotel: {
		overpassTags: ['["tourism"="hotel"]', '["tourism"="hostel"]'],
		label: 'Hotels',
		color: '#ff9800'
	},
	museum: { overpassTags: ['["tourism"="museum"]'], label: 'Museums', color: '#795548' },
	attraction: {
		overpassTags: ['["tourism"="attraction"]'],
		label: 'Attractions',
		color: '#ffc107'
	},
	viewpoint: { overpassTags: ['["tourism"="viewpoint"]'], label: 'Viewpoints', color: '#607d8b' },
	park: { overpassTags: ['["leisure"="park"]'], label: 'Parks', color: '#388e3c' },
	playground: {
		overpassTags: ['["leisure"="playground"]'],
		label: 'Playgrounds',
		color: '#8bc34a'
	},
	// Transport
	fuel: { overpassTags: ['["amenity"="fuel"]'], label: 'Fuel Stations', color: '#455a64' },
	parking: { overpassTags: ['["amenity"="parking"]'], label: 'Parking', color: '#78909c' },
	ev_charging: {
		overpassTags: ['["amenity"="charging_station"]'],
		label: 'EV Charging',
		color: '#00bcd4'
	},
	bus_station: {
		overpassTags: ['["amenity"="bus_station"]', '["highway"="bus_stop"]'],
		label: 'Bus Stations',
		color: '#3f51b5'
	},
	train_station: {
		overpassTags: ['["railway"="station"]'],
		label: 'Train Stations',
		color: '#1a237e'
	},
	// Finance
	atm: { overpassTags: ['["amenity"="atm"]'], label: 'ATMs', color: '#2e7d32' },
	bank: { overpassTags: ['["amenity"="bank"]'], label: 'Banks', color: '#1b5e20' },
	// Services
	post_office: {
		overpassTags: ['["amenity"="post_office"]'],
		label: 'Post Offices',
		color: '#f44336'
	},
	police: { overpassTags: ['["amenity"="police"]'], label: 'Police', color: '#1565c0' },
	toilets: { overpassTags: ['["amenity"="toilets"]'], label: 'Toilets', color: '#757575' },
	drinking_water: {
		overpassTags: ['["amenity"="drinking_water"]'],
		label: 'Drinking Water',
		color: '#0288d1'
	},
	library: { overpassTags: ['["amenity"="library"]'], label: 'Libraries', color: '#6a1b9a' }
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
		label: 'Food & Drink',
		categories: ['restaurant', 'fast_food', 'cafe', 'bar']
	},
	{
		id: 'shopping',
		label: 'Shopping',
		categories: ['supermarket', 'convenience', 'bakery', 'clothes', 'marketplace']
	},
	{ id: 'health', label: 'Health', categories: ['pharmacy', 'hospital', 'doctor', 'dentist'] },
	{
		id: 'tourism',
		label: 'Tourism & Leisure',
		categories: ['hotel', 'museum', 'attraction', 'viewpoint', 'park', 'playground']
	},
	{
		id: 'transport',
		label: 'Transport',
		categories: ['fuel', 'parking', 'ev_charging', 'bus_station', 'train_station']
	},
	{ id: 'finance', label: 'Finance', categories: ['atm', 'bank'] },
	{
		id: 'services',
		label: 'Services',
		categories: ['post_office', 'police', 'toilets', 'drinking_water', 'library']
	}
]

// ============================================
// Overpass servers
// ============================================

export type OverpassServer = 'overpass-de' | 'overpass-private-coffee'

export const OVERPASS_SERVERS: Record<OverpassServer, { label: string; url: string }> = {
	'overpass-de': {
		label: 'overpass-api.de (default)',
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
	activeTileLayerId: 'osm-standard',
	nominatimConsent: false,
	overpassConsent: false,
	overpassServer: 'overpass-de'
}

// vim: ts=4
