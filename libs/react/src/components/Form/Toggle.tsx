// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'
import { useFieldControl } from './Field.js'

/** On/off setting that takes effect immediately: switch on the trailing side, whole row clickable */
export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	color?: ColorVariant
	label?: React.ReactNode
	/** Muted second line under the label */
	description?: React.ReactNode
}

export const Toggle = createComponent<HTMLInputElement, ToggleProps>(
	'Toggle',
	({ className, color, label, description, ...props }, ref) => {
		const field = useFieldControl(props, ref, 'Toggle')
		const descId = React.useId()
		const hasDesc = label != null && description != null
		const describedBy =
			[field.controlProps['aria-describedby'], hasDesc && descId].filter(Boolean).join(' ') ||
			undefined

		const input = (
			<input
				{...props}
				{...field.controlProps}
				aria-describedby={describedBy}
				ref={field.ref}
				type="checkbox"
				role="switch"
				className={mergeClasses('c-toggle', color, label == null && className)}
			/>
		)
		if (label == null) return input

		return (
			<label className={mergeClasses('c-choice', className)}>
				<span className="c-choice-text">
					<span className="c-choice-label">{label}</span>
					{hasDesc && (
						<span id={descId} className="c-choice-description">
							{description}
						</span>
					)}
				</span>
				{input}
			</label>
		)
	}
)

// vim: ts=4
