// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { UseSidebarReturn } from './useSidebar.js'

export interface SidebarContextValue extends Partial<UseSidebarReturn> {
	side?: 'left' | 'right'
}

export const SidebarContext = React.createContext<SidebarContextValue>({})

export function useSidebarContext() {
	return React.useContext(SidebarContext)
}

// vim: ts=4
