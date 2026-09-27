// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'

import { Button } from '../Button/Button.js'
import { mergeClasses } from '../utils.js'
import { FcdFilterContext } from './FcdContainer.js'

export interface FcdFilterProps {
	className?: string
	/** Mobile visibility; defaults to the Container's built-in toggle state (`filterLabel`) */
	isVisible?: boolean
	hide?: () => void
	/** Hide the filter rail at md+ and let content take its space */
	collapsed?: boolean
	children?: React.ReactNode
}

export function FcdFilter({ className, isVisible, hide, collapsed, children }: FcdFilterProps) {
	const ctx = React.useContext(FcdFilterContext)
	const visible = isVisible ?? ctx?.filterOpen
	const onHide = hide ?? (ctx ? () => ctx.setFilterOpen(false) : undefined)

	return (
		<div
			id={ctx?.filterId}
			className={mergeClasses(
				'c-fcd-filter c-vbox sm-hide-dyn hide-left col-md-4 col-lg-3 h-100 overflow-y-auto',
				className,
				visible && 'show',
				collapsed && 'collapsed'
			)}
			onClick={onHide}
		>
			<div className="pos-absolute top-0 right-0 bottom-0 left-0 bg-shadow md-hide lg-hide" />
			<Button
				variant="link"
				className="pos-absolute top-0 right-0 m-1 p-2 z-10 md-hide lg-hide"
				onClick={onHide}
			>
				<IcClose />
			</Button>
			<div className="w-100 fill c-vbox h-min-0" onClick={(evt) => evt.stopPropagation()}>
				{children}
			</div>
		</div>
	)
}

// vim: ts=4
