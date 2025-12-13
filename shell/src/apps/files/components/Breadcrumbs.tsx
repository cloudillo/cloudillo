// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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
import { useTranslation } from 'react-i18next'
import { LuChevronRight as IcChevron, LuFolder as IcHome } from 'react-icons/lu'
import { mergeClasses } from '@cloudillo/react'
import type { BreadcrumbItem } from '../hooks/useFileNavigation.js'

interface BreadcrumbsProps {
	className?: string
	items: BreadcrumbItem[]
	onNavigate: (folderId: string | null) => void
}

export const Breadcrumbs = React.memo(function Breadcrumbs({
	className,
	items,
	onNavigate
}: BreadcrumbsProps) {
	const { t } = useTranslation()

	if (items.length <= 1) {
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
								<span className="text-primary fw-medium">{item.name}</span>
							) : (
								<a
									href="#"
									className="c-link"
									onClick={(e) => {
										e.preventDefault()
										onNavigate(item.id)
									}}
								>
									{index === 0 ? (
										<span className="c-hbox align-items-center g-1">
											<IcHome />
											<span>{item.name}</span>
										</span>
									) : (
										item.name
									)}
								</a>
							)}
						</li>
					)
				})}
			</ol>
		</nav>
	)
})

// vim: ts=4
