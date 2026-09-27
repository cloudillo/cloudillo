// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface TabsContextValue {
	value?: string
	onTabChange?: (value: string) => void
}

export const TabsContext = React.createContext<TabsContextValue>({})

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	value?: string
	onTabChange?: (value: string) => void
	/** Wrap tabs onto more lines instead of overflowing */
	wrap?: boolean
	children?: React.ReactNode
}

export const Tabs = createComponent<HTMLDivElement, TabsProps>(
	'Tabs',
	({ className, value, onTabChange, wrap, children, ...props }, ref) => {
		return (
			<TabsContext.Provider value={{ value, onTabChange }}>
				<div
					ref={ref}
					className={mergeClasses('c-tabs', wrap && 'wrap', className)}
					role="tablist"
					{...props}
				>
					{children}
				</div>
			</TabsContext.Provider>
		)
	}
)

// vim: ts=4
