// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuChevronRight as IcChevron } from 'react-icons/lu'
import { mergeClasses, createComponent } from '../utils.js'

// Accordion Context
interface AccordionContextValue {
	openItems: Set<string>
	toggle: (id: string) => void
	multiple: boolean
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)

function useAccordionContext(): AccordionContextValue {
	const ctx = React.useContext(AccordionContext)
	if (!ctx) {
		throw new Error('AccordionItem must be used within an Accordion')
	}
	return ctx
}

// Accordion Container
export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
	defaultOpen?: string[]
	multiple?: boolean
	borderless?: boolean
	compact?: boolean
	children?: React.ReactNode
}

export const Accordion = createComponent<HTMLDivElement, AccordionProps>(
	'Accordion',
	(
		{ defaultOpen = [], multiple = false, borderless, compact, className, children, ...props },
		ref
	) => {
		const [openItems, setOpenItems] = React.useState<Set<string>>(() => new Set(defaultOpen))

		const toggle = React.useCallback(
			function toggle(id: string) {
				setOpenItems((prev) => {
					const next = new Set(multiple ? prev : [])
					if (prev.has(id)) {
						next.delete(id)
					} else {
						next.add(id)
					}
					return next
				})
			},
			[multiple]
		)

		const contextValue = React.useMemo(
			() => ({ openItems, toggle, multiple }),
			[openItems, toggle, multiple]
		)

		return (
			<AccordionContext.Provider value={contextValue}>
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
			</AccordionContext.Provider>
		)
	}
)

// Accordion Item
export interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
	id: string
	title: string
	icon?: React.ReactNode
	children?: React.ReactNode
}

export const AccordionItem = createComponent<HTMLDivElement, AccordionItemProps>(
	'AccordionItem',
	({ id, title, icon, className, children, ...props }, ref) => {
		const { openItems, toggle } = useAccordionContext()
		const isOpen = openItems.has(id)
		const headerId = `accordion-header-${id}`
		const contentId = `accordion-content-${id}`

		return (
			<div
				ref={ref}
				className={mergeClasses('c-accordion-item', isOpen && 'open', className)}
				{...props}
			>
				<button
					id={headerId}
					type="button"
					className="c-accordion-header"
					onClick={() => toggle(id)}
					aria-expanded={isOpen}
					aria-controls={contentId}
				>
					{icon && <span className="c-accordion-header-icon">{icon}</span>}
					<span>{title}</span>
					<IcChevron className="c-accordion-icon" />
				</button>
				<div
					id={contentId}
					className="c-accordion-content"
					role="region"
					aria-labelledby={headerId}
				>
					{children}
				</div>
			</div>
		)
	}
)

// vim: ts=4
