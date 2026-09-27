// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Disclosure, DisclosureGroupContext, type DisclosureProps } from '../Disclosure/index.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
	/** At most one item open at a time (native `<details name>`). */
	exclusive?: boolean
	borderless?: boolean
	compact?: boolean
	children?: React.ReactNode
}

/** A group of `Disclosure`s. Items set their own `defaultOpen`/`open`. */
export const Accordion = createComponent<HTMLDivElement, AccordionProps>(
	'Accordion',
	({ exclusive, borderless, compact, className, children, ...props }, ref) => {
		const name = React.useId()
		const group = React.useMemo(
			() => ({ name: exclusive ? name : undefined }),
			[exclusive, name]
		)

		return (
			<DisclosureGroupContext.Provider value={group}>
				<div
					ref={ref}
					className={mergeClasses(
						'c-accordion',
						borderless && 'borderless',
						compact && 'compact',
						className
					)}
					{...props}
				>
					{children}
				</div>
			</DisclosureGroupContext.Provider>
		)
	}
)

/** @deprecated Use `Disclosure` inside an `Accordion`. */
export const AccordionItem = Disclosure
/** @deprecated Use `DisclosureProps`. */
export type AccordionItemProps = DisclosureProps

// vim: ts=4
