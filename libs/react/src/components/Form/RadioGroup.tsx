// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'
import { FieldContext, useFieldControl } from './Field.js'

export interface RadioOption<V extends string = string> {
	value: V
	label: React.ReactNode
	description?: React.ReactNode
	/** Card only: icon or avatar before the title */
	leading?: React.ReactNode
	disabled?: boolean
}

/** 2–5 exclusive options that need descriptions; `variant="card"` for rich choices */
export interface RadioGroupProps<V extends string = string>
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
	options: RadioOption<V>[]
	value?: V
	onChange?: (value: V) => void
	/** Radio input name (generated when omitted) */
	name?: string
	variant?: 'card'
	orientation?: 'vertical' | 'horizontal'
	disabled?: boolean
	required?: boolean
}

const RadioGroupImpl = createComponent<HTMLDivElement, RadioGroupProps>(
	'RadioGroup',
	(
		{
			className,
			options,
			value,
			onChange,
			name,
			variant,
			orientation = 'vertical',
			disabled,
			required,
			...props
		},
		ref
	) => {
		const fieldCtx = React.useContext(FieldContext)
		const field = useFieldControl<HTMLDivElement>({ ...props, required }, ref, 'RadioGroup')
		const autoName = React.useId()
		const descBase = React.useId()
		const { required: req, ...groupProps } = field.controlProps
		const card = variant === 'card'

		return (
			<div
				{...props}
				{...groupProps}
				ref={field.ref}
				role="radiogroup"
				aria-labelledby={props['aria-labelledby'] ?? fieldCtx?.labelId}
				aria-required={req}
				className={mergeClasses(
					'c-radio-group',
					orientation === 'horizontal' && 'horizontal',
					className
				)}
			>
				{options.map((opt, i) => {
					const descId = opt.description != null ? `${descBase}-${i}` : undefined
					const input = (
						<input
							type="radio"
							className="c-radio"
							name={name ?? autoName}
							value={opt.value}
							checked={value === undefined ? undefined : value === opt.value}
							disabled={disabled || opt.disabled}
							required={req}
							aria-describedby={descId}
							onChange={() => onChange?.(opt.value)}
						/>
					)
					return (
						<label key={opt.value} className={mergeClasses('c-choice', card && 'card')}>
							{!card && input}
							{card && opt.leading != null && (
								<span className="c-choice-leading">{opt.leading}</span>
							)}
							<span className="c-choice-text">
								<span className="c-choice-label">{opt.label}</span>
								{descId && (
									<span id={descId} className="c-choice-description">
										{opt.description}
									</span>
								)}
							</span>
							{card && input}
						</label>
					)
				})}
			</div>
		)
	}
)

/** Generic over the option value type, so `onChange` hands back the caller's union */
export const RadioGroup = RadioGroupImpl as unknown as <V extends string = string>(
	props: RadioGroupProps<V> & React.RefAttributes<HTMLDivElement>
) => React.ReactElement

// vim: ts=4
