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
