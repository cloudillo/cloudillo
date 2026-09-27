// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { useMergedRefs } from '../hooks.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface FieldContextValue {
	/** id the control must carry, so the Field label points at it */
	id: string
	/** id of the Field's label; group controls (RadioGroup) use it for aria-labelledby */
	labelId: string
	hintId?: string
	errorId?: string
	invalid: boolean
	required: boolean
	size?: 'sm' | 'md' | 'lg'
}

// Bundlers define `process.env.NODE_ENV`; unbundled it throws and counts as development
declare const process: { env: { NODE_ENV?: string } }
function isProduction(): boolean {
	try {
		return process.env.NODE_ENV === 'production'
	} catch {
		return false
	}
}

export const FieldContext = React.createContext<FieldContextValue | undefined>(undefined)

/** The props a control forwards to `useFieldControl` (its own, which win over the Field's) */
export interface FieldControlProps {
	id?: string
	required?: boolean
	'aria-describedby'?: string
	'aria-invalid'?: React.AriaAttributes['aria-invalid']
	'aria-label'?: string
	'aria-labelledby'?: string
}

/**
 * Wires a form control into its enclosing `Field`: returns the id, aria-describedby,
 * aria-invalid and required to spread on the control element, the Field's size, and a ref
 * to put on that element. In development it logs an error for a control with no label.
 */
export function useFieldControl<T extends HTMLElement>(
	props: FieldControlProps,
	ref?: React.Ref<T>,
	displayName = 'Form control'
): {
	ref: React.RefCallback<T>
	size: FieldContextValue['size']
	controlProps: Pick<FieldControlProps, 'id' | 'required' | 'aria-describedby' | 'aria-invalid'>
} {
	const field = React.useContext(FieldContext)
	const elRef = React.useRef<T>(null)
	const mergedRef = useMergedRefs(ref, elRef)
	const labelled = !!(field || props['aria-label'] || props['aria-labelledby'])

	React.useEffect(() => {
		if (labelled || isProduction()) return
		const el = elRef.current
		// A native <label> (wrapping or htmlFor) also names the control
		if (!el || (el as unknown as HTMLInputElement).labels?.length) return
		if ((el as unknown as HTMLInputElement).type === 'hidden') return
		console.error(
			`${displayName} has no label: wrap it in <Field label> or give it aria-label / aria-labelledby`,
			el
		)
	}, [labelled, displayName])

	const describedBy =
		[props['aria-describedby'], field?.hintId, field?.errorId].filter(Boolean).join(' ') ||
		undefined

	return {
		ref: mergedRef,
		size: field?.size,
		controlProps: {
			id: props.id ?? field?.id,
			required: props.required ?? (field?.required || undefined),
			'aria-describedby': describedBy,
			'aria-invalid': props['aria-invalid'] ?? (field?.invalid || undefined)
		}
	}
}

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> {
	label: React.ReactNode
	hint?: React.ReactNode
	/** Error message; setting it marks the control aria-invalid */
	error?: React.ReactNode
	required?: boolean
	orientation?: 'vertical' | 'horizontal'
	size?: 'sm' | 'md' | 'lg'
	/** id of the control (generated when omitted) — set it here, not on the control */
	id?: string
	children?: React.ReactNode
}

export const Field = createComponent<HTMLDivElement, FieldProps>(
	'Field',
	(
		{
			className,
			label,
			hint,
			error,
			required,
			orientation = 'vertical',
			size,
			id,
			children,
			...props
		},
		ref
	) => {
		const autoId = React.useId()
		const controlId = id ?? autoId
		const hintId = hint ? `${controlId}-hint` : undefined
		const errorId = error ? `${controlId}-error` : undefined

		const ctx = React.useMemo<FieldContextValue>(
			() => ({
				id: controlId,
				labelId: `${controlId}-label`,
				hintId,
				errorId,
				invalid: !!error,
				required: !!required,
				size
			}),
			[controlId, hintId, errorId, error, required, size]
		)

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-field',
					orientation === 'horizontal' && 'horizontal',
					size,
					className
				)}
				{...props}
			>
				<label id={`${controlId}-label`} className="c-field-label" htmlFor={controlId}>
					{label}
					{required && (
						<span className="c-field-required" aria-hidden="true">
							*
						</span>
					)}
				</label>
				<div className="c-field-control">
					<FieldContext.Provider value={ctx}>{children}</FieldContext.Provider>
				</div>
				{hint && (
					<div id={hintId} className="c-field-hint">
						{hint}
					</div>
				)}
				{error && (
					<div id={errorId} className="c-field-error">
						{error}
					</div>
				)}
			</div>
		)
	}
)

// vim: ts=4
