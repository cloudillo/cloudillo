// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronRight as IcChevron,
	LuFolder as IcHome,
	LuShare2 as IcShare
} from 'react-icons/lu'
import { mergeClasses } from '@cloudillo/react'
import type { BreadcrumbItem } from '../hooks/useFileNavigation.js'

interface BreadcrumbsProps {
	className?: string
	items: BreadcrumbItem[]
	onNavigate: (folderId: string | null) => void
	isRemoteBrowsing?: boolean
	accessLevel?: 'read' | 'write'
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

	return (
		<nav className={mergeClasses('c-breadcrumbs', className)} aria-label={t('Breadcrumb')}>
			<ol className="c-hbox g-1 align-items-center">
				{items.map((item, index) => {
					const isLast = index === items.length - 1

					return (
						<li key={item.id ?? 'root'} className="c-hbox align-items-center">
							{index > 0 && <IcChevron className="mx-1 text-secondary" />}
							{isLast ? (
								<span className="c-hbox align-items-center text-primary fw-medium">
									{item.isShareRoot && <IcShare className="me-1" size="1em" />}
									{item.isShareRoot && item.ownerName && (
										<span className="text-secondary me-1">
											{item.ownerName}:
										</span>
									)}
									{item.name}
								</span>
							) : (
								<a
									href="#"
									className="c-link"
									onClick={(e) => {
										e.preventDefault()
										onNavigate(item.id)
									}}
								>
									{!isRemoteBrowsing && index === 0 ? (
										<span className="c-hbox align-items-center g-1">
											<IcHome />
											<span>{item.name}</span>
										</span>
									) : (
										<span className="c-hbox align-items-center">
											{item.isShareRoot && (
												<IcShare className="me-1" size="1em" />
											)}
											{item.isShareRoot && item.ownerName && (
												<span className="text-secondary me-1">
													{item.ownerName}:
												</span>
											)}
											{item.name}
										</span>
									)}
								</a>
							)}
						</li>
					)
				})}
				{isRemoteBrowsing && accessLevel && (
					<li className="c-hbox align-items-center">
						<span className="mx-1 text-secondary">{'·'}</span>
						<span className="text-secondary">
							{accessLevel === 'write' ? t('Can edit') : t('Read only')}
						</span>
					</li>
				)}
			</ol>
		</nav>
	)
})

// vim: ts=4
