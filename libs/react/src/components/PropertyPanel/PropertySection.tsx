// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import { LuChevronDown, LuChevronRight } from 'react-icons/lu'

export interface PropertySectionProps extends React.HTMLAttributes<HTMLDivElement> {
	title: string
	defaultExpanded?: boolean
	children?: React.ReactNode
}

export const PropertySection = createComponent<HTMLDivElement, PropertySectionProps>(
	'PropertySection',
	({ className, title, defaultExpanded = true, children, ...props }, ref) => {
		const [expanded, setExpanded] = React.useState(defaultExpanded)

		return (
			<div ref={ref} className={mergeClasses('c-property-section', className)} {...props}>
				<button
					type="button"
					className="c-property-section-header"
					onClick={() => setExpanded(!expanded)}
				>
					{expanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
					<span className="c-property-section-title">{title}</span>
				</button>
				{expanded && (
					<div className="c-property-section-content c-vbox g-1">{children}</div>
				)}
			</div>
		)
	}
)

// vim: ts=4
