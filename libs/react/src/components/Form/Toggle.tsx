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
import type { ColorVariant } from '../types.js'

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	variant?: ColorVariant
	label?: React.ReactNode
}

export const Toggle = createComponent<HTMLInputElement, ToggleProps>(
	'Toggle',
	({ className, variant, label, id, ...props }, ref) => {
		const toggleId = id || React.useId()

		if (label) {
			return (
				<label className="c-hbox g-2 align-items-center">
					<input
						ref={ref}
						id={toggleId}
						type="checkbox"
						className={mergeClasses('c-toggle', variant, className)}
						{...props}
					/>
					<span>{label}</span>
				</label>
			)
		}

		return (
			<input
				ref={ref}
				id={toggleId}
				type="checkbox"
				className={mergeClasses('c-toggle', variant, className)}
				{...props}
			/>
		)
	}
)

// vim: ts=4
