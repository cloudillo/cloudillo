// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import { IcDisclosure } from '../../icons.js'
import { createComponent, mergeClasses } from '../utils.js'

/** Set by `Accordion`: the shared native `name` that makes its Disclosures exclusive. */
export const DisclosureGroupContext = React.createContext<{ name?: string } | null>(null)

export type DisclosureVariant = 'ghost' | 'panel'

export interface DisclosureProps
	extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, 'onToggle' | 'title'> {
	summary: React.ReactNode
	/** Leading icon in the summary row. */
	icon?: React.ReactNode
	/** Controlled open state. */
	open?: boolean
	/** Initial open state when uncontrolled. */
	defaultOpen?: boolean
	onToggle?: (open: boolean) => void
	/** Defaults to `ghost`. */
	variant?: DisclosureVariant
}

export const Disclosure = createComponent<HTMLDetailsElement, DisclosureProps>(
	'Disclosure',
	(
		{
			summary,
			icon,
			open,
			defaultOpen,
			onToggle,
			variant = 'ghost',
			name,
			className,
			children,
			...props
		},
		ref
	) => {
		const group = React.useContext(DisclosureGroupContext)

		// controlled `open` is only pushed to the DOM when the prop changes;
		// a parent that ignores onToggle leaves the native state as the user set it.
		return (
			<details
				ref={ref}
				className={mergeClasses('c-disclosure', variant, className)}
				name={name ?? group?.name}
				open={open ?? defaultOpen}
				onToggle={(evt) => onToggle?.(evt.currentTarget.open)}
				{...props}
			>
				<summary>
					{icon && <span className="c-disclosure-icon">{icon}</span>}
					<span className="flex-fill">{summary}</span>
					<IcDisclosure className="c-disclosure-chevron" aria-hidden="true" />
				</summary>
				<div className="c-disclosure-content">{children}</div>
			</details>
		)
	}
)

// vim: ts=4
