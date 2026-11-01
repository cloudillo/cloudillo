// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { IcClose, IcDisclosure, IcLoading, IcLocation } from '@cloudillo/react'
import * as React from 'react'
import { Trans, useTranslation } from 'react-i18next'

import {
	IcAtm,
	IcAttraction,
	IcBakery,
	IcBank,
	IcBar,
	IcBusStation,
	IcCafe,
	IcClothes,
	IcConvenience,
	IcDentist,
	IcDoctor,
	IcDrinkingWater,
	IcEvCharging,
	IcFastFood,
	IcFuel,
	IcHospital,
	IcHotel,
	IcLibrary,
	IcMarketplace,
	IcMuseum,
	IcPark,
	IcParking,
	IcPharmacy,
	IcPlayground,
	IcPolice,
	IcPostOffice,
	IcRestaurant,
	IcSupermarket,
	IcToilets,
	IcTrainStation,
	IcViewpoint
} from './icons.js'
import type { PoiCategory, PoiFeature, PoiGroupId } from './types.js'
import { POI_CATEGORIES, POI_GROUPS } from './types.js'

/** Overpass queries cover the visible area, so below this zoom they would be too large. */
export const MIN_POI_ZOOM = 13

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
	zoom: number
	privacyAcknowledged: boolean
	onPrivacyAcknowledge: () => void
	open: boolean
	onToggle: (open: boolean) => void
}

export function PoiPanel({
	onResults,
	queryPois,
	zoom,
	privacyAcknowledged,
	onPrivacyAcknowledge,
	open,
	onToggle
}: PoiPanelProps) {
	const { t } = useTranslation()
	const [activeCategory, setActiveCategory] = React.useState<PoiCategory | null>(null)
	const [resultCount, setResultCount] = React.useState<number | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	const [showPrivacyNotice, setShowPrivacyNotice] = React.useState(false)
	const [expandedGroup, setExpandedGroup] = React.useState<PoiGroupId | null>(POI_GROUPS[0].id)
	const pendingCategoryRef = React.useRef<PoiCategory | null>(null)
	const zoomedOut = zoom < MIN_POI_ZOOM

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
			setError(t('Failed to query places. Try again later.'))
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
				title={t('Explore nearby places')}
			>
				<IcLocation />
			</button>
		)
	}

	return (
		<div className="mapillo-poi-panel">
			<div className="mapillo-poi-header">
				<span>{t('Explore POIs')}</span>
				<button onClick={handleClose} title={t('Close')}>
					<IcClose />
				</button>
			</div>

			<div className="mapillo-poi-body">
				{zoomedOut && (
					<div className="mapillo-poi-zoom-hint" role="status">
						{t('Zoom in to explore places')}
					</div>
				)}
				{POI_GROUPS.map((group) => {
					const expanded = expandedGroup === group.id
					return (
						<div key={group.id} className="mapillo-poi-group">
							<button
								className={`mapillo-poi-group-header ${expanded ? 'expanded' : ''}`}
								onClick={() => toggleGroup(group.id)}
							>
								<span>{t(group.label)}</span>
								<IcDisclosure />
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
												disabled={loading || zoomedOut}
												title={t(cat.label)}
											>
												<span
													className="mapillo-poi-cat-dot"
													style={{ backgroundColor: cat.color }}
												/>
												<Icon />
												<span>{t(cat.label)}</span>
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
						<Trans
							i18nKey="This will contact the <0>Overpass API</0> server. Your map area will be sent to overpass-api.de to query points of interest."
							components={[<b key="b" />]}
						/>
					</p>
					<div className="mapillo-privacy-actions">
						<button onClick={() => setShowPrivacyNotice(false)}>{t('Cancel')}</button>
						<button className="mapillo-btn-primary" onClick={handlePrivacyAccept}>
							{t('OK, search')}
						</button>
					</div>
				</div>
			)}

			{loading && (
				<div className="mapillo-poi-status">
					<IcLoading className="mapillo-spin" /> {t('Searching...')}
				</div>
			)}
			{error && <div className="mapillo-poi-status mapillo-poi-error">{error}</div>}
			{!error && !loading && resultCount !== null && (
				<div className="mapillo-poi-status">
					{resultCount === 0
						? t('No places found in this area')
						: t('{{count}} places found', { count: resultCount })}
				</div>
			)}

			<div className="mapillo-poi-attribution">{t('Data: OpenStreetMap / Overpass API')}</div>
		</div>
	)
}

// vim: ts=4
