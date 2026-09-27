// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { HBox, Icon, Input, Text, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMapPin as IcMapPin } from 'react-icons/lu'

import type { LocationContent, SectionWithContent } from '../types.js'
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
		<HBox gap={2} align="center">
			<Icon as={IcMapPin} className="text-muted" />
			<Text>{parts.join(', ')}</Text>
		</HBox>
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
		<VBox gap={2}>
			<Input
				aria-label={t('City')}
				placeholder={t('City')}
				value={data.city || ''}
				onChange={(e) => update('city', e.target.value)}
			/>
			<Input
				aria-label={t('Country')}
				placeholder={t('Country')}
				value={data.country || ''}
				onChange={(e) => update('country', e.target.value)}
			/>
			<Input
				aria-label={t('Address')}
				placeholder={t('Address')}
				value={data.address || ''}
				onChange={(e) => update('address', e.target.value)}
			/>
		</VBox>
	)
}

// vim: ts=4
