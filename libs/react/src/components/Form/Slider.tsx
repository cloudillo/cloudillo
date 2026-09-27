// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { useFieldControl } from './Field.js'

/** Native range input with a value readout; `className` goes on the wrapper row */
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	/** Show the current value next to the track (default true) */
	showValue?: boolean
	/** Readout formatter, e.g. `(v) => `${v}%`` */
	format?: (value: number) => React.ReactNode
}

export const Slider = createComponent<HTMLInputElement, SliderProps>(
	'Slider',
	({ className, showValue = true, format, onChange, ...props }, ref) => {
		const field = useFieldControl(props, ref, 'Slider')
		// Without a defaultValue the native thumb starts at the midpoint
		const [uncontrolled, setUncontrolled] = React.useState(() =>
			props.defaultValue !== undefined
				? Number(props.defaultValue)
				: (Number(props.min ?? 0) + Number(props.max ?? 100)) / 2
		)
		const value = props.value !== undefined ? Number(props.value) : uncontrolled

		function handleChange(evt: React.ChangeEvent<HTMLInputElement>) {
			setUncontrolled(Number(evt.target.value))
			onChange?.(evt)
		}

		return (
			<div className={mergeClasses('c-slider', className)}>
				<input
					{...props}
					{...field.controlProps}
					ref={field.ref}
					type="range"
					onChange={handleChange}
				/>
				{showValue && (
					// The range input already announces its value; the readout is visual only
					<span className="c-slider-value" aria-hidden>
						{format ? format(value) : value}
					</span>
				)}
			</div>
		)
	}
)

// vim: ts=4
