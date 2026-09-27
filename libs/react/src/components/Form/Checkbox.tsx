// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { useFieldControl } from './Field.js'

/** Choice submitted later, multi-select option, "I agree", row selection: box on the leading side */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	label?: React.ReactNode
	/** Muted second line under the label */
	description?: React.ReactNode
	/** `card`: bordered tile (leading, title, description, check indicator trailing) */
	variant?: 'card'
	/** Card only: icon or avatar before the title */
	leading?: React.ReactNode
}

export const Checkbox = createComponent<HTMLInputElement, CheckboxProps>(
	'Checkbox',
	({ className, label, description, variant, leading, ...props }, ref) => {
		const field = useFieldControl(props, ref, 'Checkbox')
		const descId = React.useId()
		const hasDesc = label != null && description != null
		const describedBy =
			[field.controlProps['aria-describedby'], hasDesc && descId].filter(Boolean).join(' ') ||
			undefined
		const card = variant === 'card'

		const input = (
			<input
				{...props}
				{...field.controlProps}
				aria-describedby={describedBy}
				ref={field.ref}
				type="checkbox"
				className={mergeClasses('c-check', label == null && className)}
			/>
		)
		if (label == null) return input

		return (
			<label className={mergeClasses('c-choice', card && 'card', className)}>
				{!card && input}
				{card && leading != null && <span className="c-choice-leading">{leading}</span>}
				<span className="c-choice-text">
					<span className="c-choice-label">{label}</span>
					{hasDesc && (
						<span id={descId} className="c-choice-description">
							{description}
						</span>
					)}
				</span>
				{card && input}
			</label>
		)
	}
)

// vim: ts=4
