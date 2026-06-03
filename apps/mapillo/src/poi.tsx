// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import {
	// Finance
	LuBanknote as IcAtm,
	LuStar as IcAttraction,
	LuCakeSlice as IcBakery,
	LuBuilding as IcBank,
	LuBeer as IcBar,
	LuBus as IcBusStation,
	LuCoffee as IcCafe,
	LuChevronRight as IcChevron,
	LuX as IcClose,
	LuShirt as IcClothes,
	LuStore as IcConvenience,
	LuSmile as IcDentist,
	LuStethoscope as IcDoctor,
	LuDroplets as IcDrinkingWater,
	LuPlugZap as IcEvCharging,
	LuHam as IcFastFood,
	// Transport
	LuFuel as IcFuel,
	LuHospital as IcHospital,
	// Tourism & Leisure
	LuHotel as IcHotel,
	LuBookOpen as IcLibrary,
	LuLoader as IcLoading,
	LuShoppingBag as IcMarketplace,
	LuLandmark as IcMuseum,
	LuTrees as IcPark,
	LuCircleParking as IcParking,
	// Health
	LuCross as IcPharmacy,
	LuToyBrick as IcPlayground,
	LuMapPin as IcPoi,
	LuShield as IcPolice,
	// Services
	LuMail as IcPostOffice,
	// Food & Drink
	LuUtensilsCrossed as IcRestaurant,
	// Shopping
	LuShoppingCart as IcSupermarket,
	LuDoorOpen as IcToilets,
	LuTrainFront as IcTrainStation,
	LuMountain as IcViewpoint
} from 'react-icons/lu'

import type { PoiCategory, PoiFeature, PoiGroupId } from './types.js'
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
				className="mapillo-ctrl mapillo-poi-toggle"
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
