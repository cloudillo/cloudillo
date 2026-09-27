// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Badge, Breadcrumbs as BreadcrumbTrail, HBox, Text } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFolder as IcHome, LuShare2 as IcShare } from 'react-icons/lu'

import type { BreadcrumbItem } from '../hooks/useFileNavigation.js'
import { canWrite, type FileAccessLevel } from '../utils.js'

interface BreadcrumbsProps {
	className?: string
	items: BreadcrumbItem[]
	onNavigate: (folderId: string | null) => void
	isRemoteBrowsing?: boolean
	accessLevel?: FileAccessLevel
}

export const Breadcrumbs = React.memo(function Breadcrumbs({
	className,
	items,
	onNavigate,
	isRemoteBrowsing,
	accessLevel
}: BreadcrumbsProps) {
	const { t } = useTranslation()

	if (items.length <= 1 && !isRemoteBrowsing) {
		return null
	}

	const crumbs = items.map((item, index) => ({
		icon: item.isShareRoot ? (
			<IcShare />
		) : !isRemoteBrowsing && index === 0 ? (
			<IcHome />
		) : undefined,
		label:
			item.isShareRoot && item.ownerName ? (
				<>
					<Text color="secondary">{item.ownerName}:</Text> {item.name}
				</>
			) : (
				item.name
			),
		onClick: index < items.length - 1 ? () => onNavigate(item.id) : undefined
	}))

	return (
		<HBox gap={2} align="center" wrap className={className}>
			<BreadcrumbTrail items={crumbs} />
			{isRemoteBrowsing && accessLevel && (
				<Badge>{canWrite(accessLevel) ? t('Can edit') : t('Read only')}</Badge>
			)}
		</HBox>
	)
})

// vim: ts=4
