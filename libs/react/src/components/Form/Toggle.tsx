// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
		const generatedId = React.useId()
		const toggleId = id || generatedId

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
