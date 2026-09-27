// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuChevronRight as IcChevron } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Button, Link } from '../Button/index.js'
import { mergeClasses } from '../utils.js'

export interface BreadcrumbItem {
	label: React.ReactNode
	/** Leading icon (e.g. home on the root) */
	icon?: React.ReactNode
	/** `/…` renders a router Link */
	href?: string
	onClick?: (evt: React.MouseEvent) => void
}

export interface BreadcrumbsProps {
	items: BreadcrumbItem[]
	/** Collapse the middle into a "…" button when there are more items (first + last `maxItems - 1` stay) */
	maxItems?: number
	/** `nav` accessible name (default "Breadcrumb") */
	label?: string
	className?: string
}

/** Path trail; the last item is the current page. */
export function Breadcrumbs({ items, maxItems, label, className }: BreadcrumbsProps) {
	const { t } = useLibTranslation()
	const [expanded, setExpanded] = React.useState(false)
	const collapse = !expanded && maxItems !== undefined && maxItems >= 2 && items.length > maxItems
	const shown = collapse ? [items[0], null, ...items.slice(items.length - (maxItems - 1))] : items

	return (
		<nav
			className={mergeClasses('c-breadcrumbs', className)}
			aria-label={label ?? t('Breadcrumb')}
		>
			<ol>
				{shown.map((item, index) => {
					const isLast = index === shown.length - 1
					return (
						<li key={index}>
							{index > 0 && (
								<IcChevron className="c-breadcrumbs-sep" aria-hidden="true" />
							)}
							{item === null ? (
								<Button
									variant="ghost"
									size="sm"
									aria-label={t('Show full path')}
									onClick={() => setExpanded(true)}
								>
									…
								</Button>
							) : isLast ? (
								<span className="c-breadcrumbs-current" aria-current="page">
									{item.icon}
									{item.label}
								</span>
							) : item.href ? (
								<Link href={item.href} icon={item.icon} onClick={item.onClick}>
									{item.label}
								</Link>
							) : (
								<Button variant="link" icon={item.icon} onClick={item.onClick}>
									{item.label}
								</Button>
							)}
						</li>
					)
				})}
			</ol>
		</nav>
	)
}

// vim: ts=4
