// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface TabsContextValue {
	value?: string
	onTabChange?: (value: string) => void
}

export const TabsContext = React.createContext<TabsContextValue>({})

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	value?: string
	onTabChange?: (value: string) => void
	children?: React.ReactNode
}

export const Tabs = createComponent<HTMLDivElement, TabsProps>(
	'Tabs',
	({ className, value, onTabChange, children, ...props }, ref) => {
		return (
			<TabsContext.Provider value={{ value, onTabChange }}>
				<div
					ref={ref}
					className={mergeClasses('c-tabs', className)}
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
