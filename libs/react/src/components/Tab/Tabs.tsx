// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
