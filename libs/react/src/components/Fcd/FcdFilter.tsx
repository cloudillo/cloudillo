// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

import { Button } from '../Button/Button.js'
import { mergeClasses } from '../utils.js'
import { FcdFilterContext } from './FcdContainer.js'

export interface FcdFilterProps {
	className?: string
	/** Mobile visibility; defaults to the Container's built-in toggle state (`filterLabel`) */
	isVisible?: boolean
	/** Required with `isVisible`, or the drawer can't be closed */
	hide?: () => void
	/** Hide the filter rail at md+ and let content take its space */
	collapsed?: boolean
	children?: React.ReactNode
}

export function FcdFilter({ className, isVisible, hide, collapsed, children }: FcdFilterProps) {
	const { t } = useTranslation()
	const ctx = React.useContext(FcdFilterContext)
	const visible = isVisible ?? ctx?.filterOpen
	const onHide =
		hide ?? (isVisible === undefined && ctx ? () => ctx.setFilterOpen(false) : undefined)

	return (
		<>
			{/* Below md: tappable backdrop beside the capped drawer */}
			{visible && <div className="c-fcd-filter-backdrop md-hide lg-hide" onClick={onHide} />}
			<div
				id={ctx?.filterId}
				className={mergeClasses(
					'c-fcd-filter sm-hide-dyn hide-left col-md-4 col-lg-3 h-100 overflow-y-auto',
					className,
					visible && 'show',
					collapsed && 'collapsed'
				)}
			>
				{onHide && (
					<div className="c-fcd-filter-header md-hide lg-hide">
						<Button variant="ghost" aria-label={t('Close')} onClick={onHide}>
							<IcClose />
						</Button>
					</div>
				)}
				<div className="c-fcd-filter-body w-100 fill h-min-0">{children}</div>
			</div>
		</>
	)
}

// vim: ts=4
