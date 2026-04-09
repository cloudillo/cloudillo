// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuMapPin as IcMapPin } from 'react-icons/lu'

import type { SectionWithContent, LocationContent } from '../types.js'
import { parseContent, stringifyContent } from '../types.js'

const EMPTY: LocationContent = { city: '', country: '', address: '' }

interface LocationSectionViewProps {
	section: SectionWithContent
}

export function LocationSectionView({ section }: LocationSectionViewProps) {
	const data = parseContent<LocationContent>(section.content, EMPTY)
	const parts = [data.address, data.city, data.country].filter(Boolean)

	if (!parts.length) return null

	return (
		<div className="c-hbox g-2 align-items-center">
			<IcMapPin className="c-section-icon" />
			<span>{parts.join(', ')}</span>
		</div>
	)
}

interface LocationSectionEditProps {
	section: SectionWithContent
	onChange: (content: string) => void
}

export function LocationSectionEdit({ section, onChange }: LocationSectionEditProps) {
	const { t } = useTranslation()
	const [data, setData] = React.useState<LocationContent>(() =>
		parseContent<LocationContent>(section.content, EMPTY)
	)

	function update(field: keyof LocationContent, value: string) {
		const next = { ...data, [field]: value }
		setData(next)
		onChange(stringifyContent(next))
	}

	return (
		<div className="c-vbox g-2">
			<input
				className="c-input"
				placeholder={t('City')}
				value={data.city || ''}
				onChange={(e) => update('city', e.target.value)}
			/>
			<input
				className="c-input"
				placeholder={t('Country')}
				value={data.country || ''}
				onChange={(e) => update('country', e.target.value)}
			/>
			<input
				className="c-input"
				placeholder={t('Address')}
				value={data.address || ''}
				onChange={(e) => update('address', e.target.value)}
			/>
		</div>
	)
}

// vim: ts=4
