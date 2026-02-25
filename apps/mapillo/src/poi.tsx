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
import {
	LuMapPin as IcPoi,
	LuX as IcClose,
	LuLoader as IcLoading,
	LuChevronRight as IcChevron,
	// Food & Drink
	LuUtensilsCrossed as IcRestaurant,
	LuHam as IcFastFood,
	LuCoffee as IcCafe,
	LuBeer as IcBar,
	// Shopping
	LuShoppingCart as IcSupermarket,
	LuStore as IcConvenience,
	LuCakeSlice as IcBakery,
	LuShirt as IcClothes,
	LuShoppingBag as IcMarketplace,
	// Health
	LuCross as IcPharmacy,
	LuHospital as IcHospital,
	LuStethoscope as IcDoctor,
	LuSmile as IcDentist,
	// Tourism & Leisure
	LuHotel as IcHotel,
	LuLandmark as IcMuseum,
	LuStar as IcAttraction,
	LuMountain as IcViewpoint,
	LuTrees as IcPark,
	LuToyBrick as IcPlayground,
	// Transport
	LuFuel as IcFuel,
	LuCircleParking as IcParking,
	LuPlugZap as IcEvCharging,
	LuBus as IcBusStation,
	LuTrainFront as IcTrainStation,
	// Finance
	LuBanknote as IcAtm,
	LuBuilding as IcBank,
	// Services
	LuMail as IcPostOffice,
	LuShield as IcPolice,
	LuDoorOpen as IcToilets,
	LuDroplets as IcDrinkingWater,
	LuBookOpen as IcLibrary
} from 'react-icons/lu'

import type { PoiFeature, PoiCategory, PoiGroupId } from './types.js'
import { POI_CATEGORIES, POI_GROUPS } from './types.js'

const CATEGORY_ICONS: Record<PoiCategory, React.ComponentType> = {
	restaurant: IcRestaurant,
	fast_food: IcFastFood,
	cafe: IcCafe,
	bar: IcBar,
	supermarket: IcSupermarket,
	convenience: IcConvenience,
	bakery: IcBakery,
	clothes: IcClothes,
	marketplace: IcMarketplace,
	pharmacy: IcPharmacy,
	hospital: IcHospital,
	doctor: IcDoctor,
	dentist: IcDentist,
	hotel: IcHotel,
	museum: IcMuseum,
	attraction: IcAttraction,
	viewpoint: IcViewpoint,
	park: IcPark,
	playground: IcPlayground,
	fuel: IcFuel,
	parking: IcParking,
	ev_charging: IcEvCharging,
	bus_station: IcBusStation,
	train_station: IcTrainStation,
	atm: IcAtm,
	bank: IcBank,
	post_office: IcPostOffice,
	police: IcPolice,
	toilets: IcToilets,
	drinking_water: IcDrinkingWater,
	library: IcLibrary
}

interface PoiPanelProps {
	onResults: (pois: PoiFeature[], category: PoiCategory) => void
	queryPois: (category: PoiCategory) => Promise<PoiFeature[]>
	privacyAcknowledged: boolean
	onPrivacyAcknowledge: () => void
	open: boolean
	onToggle: (open: boolean) => void
}

export function PoiPanel({
	onResults,
	queryPois,
	privacyAcknowledged,
	onPrivacyAcknowledge,
	open,
	onToggle
}: PoiPanelProps) {
	const [activeCategory, setActiveCategory] = React.useState<PoiCategory | null>(null)
	const [resultCount, setResultCount] = React.useState<number | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	const [showPrivacyNotice, setShowPrivacyNotice] = React.useState(false)
	const [expandedGroup, setExpandedGroup] = React.useState<PoiGroupId | null>(POI_GROUPS[0].id)
	const pendingCategoryRef = React.useRef<PoiCategory | null>(null)

	async function doQuery(category: PoiCategory) {
		setActiveCategory(category)
		setError(null)
		setLoading(true)
		onResults([], category)
		try {
			const results = await queryPois(category)
			setResultCount(results.length)
			onResults(results, category)
		} catch (err) {
			console.error('[Mapillo] POI query failed:', err)
			setError('Failed to query places. Try again later.')
			setResultCount(null)
		} finally {
			setLoading(false)
		}
	}

	function handleCategoryClick(category: PoiCategory) {
		if (!privacyAcknowledged) {
			pendingCategoryRef.current = category
			setShowPrivacyNotice(true)
			return
		}
		doQuery(category)
	}

	function handlePrivacyAccept() {
		onPrivacyAcknowledge()
		setShowPrivacyNotice(false)
		if (pendingCategoryRef.current) {
			doQuery(pendingCategoryRef.current)
			pendingCategoryRef.current = null
		}
	}

	function toggleGroup(groupId: PoiGroupId) {
		setExpandedGroup((prev) => (prev === groupId ? null : groupId))
	}

	function handleClose() {
		onToggle(false)
		setActiveCategory(null)
		setResultCount(null)
		setError(null)
		setLoading(false)
		setShowPrivacyNotice(false)
		onResults([], 'restaurant')
	}

	if (!open) {
		return (
			<button
				className="mapillo-poi-toggle"
				onClick={() => onToggle(true)}
				title="Explore nearby places"
			>
				<IcPoi />
			</button>
		)
	}

	return (
		<div className="mapillo-poi-panel">
			<div className="mapillo-poi-header">
				<span>Explore POIs</span>
				<button onClick={handleClose} title="Close">
					<IcClose />
				</button>
			</div>

			<div className="mapillo-poi-body">
				{POI_GROUPS.map((group) => {
					const expanded = expandedGroup === group.id
					return (
						<div key={group.id} className="mapillo-poi-group">
							<button
								className={`mapillo-poi-group-header ${expanded ? 'expanded' : ''}`}
								onClick={() => toggleGroup(group.id)}
							>
								<span>{group.label}</span>
								<IcChevron />
							</button>
							{expanded && (
								<div className="mapillo-poi-categories">
									{group.categories.map((key) => {
										const cat = POI_CATEGORIES[key]
										const Icon = CATEGORY_ICONS[key]
										return (
											<button
												key={key}
												className={`mapillo-poi-cat ${activeCategory === key ? 'active' : ''}`}
												onClick={() => handleCategoryClick(key)}
												disabled={loading}
												title={cat.label}
											>
												<span
													className="mapillo-poi-cat-dot"
													style={{ backgroundColor: cat.color }}
												/>
												<Icon />
												<span>{cat.label}</span>
											</button>
										)
									})}
								</div>
							)}
						</div>
					)
				})}
			</div>

			{showPrivacyNotice && (
				<div className="mapillo-privacy-notice">
					<p>
						This will contact the <b>Overpass API</b> server. Your map area will be sent
						to overpass-api.de to query points of interest.
					</p>
					<div className="mapillo-privacy-actions">
						<button onClick={() => setShowPrivacyNotice(false)}>Cancel</button>
						<button className="mapillo-btn-primary" onClick={handlePrivacyAccept}>
							OK, search
						</button>
					</div>
				</div>
			)}

			{loading && (
				<div className="mapillo-poi-status">
					<IcLoading className="mapillo-spin" /> Searching...
				</div>
			)}
			{error && <div className="mapillo-poi-status mapillo-poi-error">{error}</div>}
			{!error && !loading && resultCount !== null && (
				<div className="mapillo-poi-status">
					{resultCount === 0
						? 'No places found in this area'
						: `${resultCount} places found`}
				</div>
			)}

			<div className="mapillo-poi-attribution">Data: OpenStreetMap / Overpass API</div>
		</div>
	)
}

// vim: ts=4
