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

export interface PropertyFieldProps extends React.HTMLAttributes<HTMLDivElement> {
	label: string
	labelWidth?: number
	children?: React.ReactNode
}

export const PropertyField = createComponent<HTMLDivElement, PropertyFieldProps>(
	'PropertyField',
	({ className, label, labelWidth = 60, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-property-field c-hbox g-1', className)}
				{...props}
			>
				<span
					className="c-property-field-label"
					style={{ width: labelWidth, minWidth: labelWidth }}
				>
					{label}
				</span>
				<div className="c-property-field-control flex-fill">{children}</div>
			</div>
		)
	}
)

// vim: ts=4
