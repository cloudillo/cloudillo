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
import { atom, useAtom } from 'jotai'

export interface SidebarState {
	isOpen: boolean
	isPinned: boolean
	isCollapsed: boolean
	width: number
}

export interface UseSidebarOptions {
	id?: string
	defaultOpen?: boolean
	defaultPinned?: boolean
	defaultCollapsed?: boolean
	defaultWidth?: number
	minWidth?: number
	maxWidth?: number
}

export interface UseSidebarReturn extends SidebarState {
	open: () => void
	close: () => void
	toggle: () => void
	pin: () => void
	unpin: () => void
	togglePin: () => void
	collapse: () => void
	expand: () => void
	toggleCollapse: () => void
	setWidth: (width: number) => void
}

// Map of sidebar atoms by ID for multiple sidebars
const sidebarAtoms = new Map<string, ReturnType<typeof atom<SidebarState>>>()

function getSidebarAtom(id: string, defaults: Partial<SidebarState>) {
	if (!sidebarAtoms.has(id)) {
		sidebarAtoms.set(
			id,
			atom<SidebarState>({
				isOpen: defaults.isOpen ?? false,
				isPinned: defaults.isPinned ?? false,
				isCollapsed: defaults.isCollapsed ?? false,
				width: defaults.width ?? 256
			})
		)
	}
	return sidebarAtoms.get(id)!
}

export function useSidebar(options: UseSidebarOptions = {}): UseSidebarReturn {
	const {
		id = 'default',
		defaultOpen = false,
		defaultPinned = false,
		defaultCollapsed = false,
		defaultWidth = 256,
		minWidth = 192,
		maxWidth = 384
	} = options

	const sidebarAtom = React.useMemo(
		() =>
			getSidebarAtom(id, {
				isOpen: defaultOpen,
				isPinned: defaultPinned,
				isCollapsed: defaultCollapsed,
				width: defaultWidth
			}),
		[id]
	)

	const [state, setState] = useAtom(sidebarAtom)

	const actions = React.useMemo(
		() => ({
			open: () => setState((s) => ({ ...s, isOpen: true })),
			close: () => setState((s) => ({ ...s, isOpen: false })),
			toggle: () => setState((s) => ({ ...s, isOpen: !s.isOpen })),
			pin: () => setState((s) => ({ ...s, isPinned: true })),
			unpin: () => setState((s) => ({ ...s, isPinned: false })),
			togglePin: () => setState((s) => ({ ...s, isPinned: !s.isPinned })),
			collapse: () => setState((s) => ({ ...s, isCollapsed: true })),
			expand: () => setState((s) => ({ ...s, isCollapsed: false })),
			toggleCollapse: () => setState((s) => ({ ...s, isCollapsed: !s.isCollapsed })),
			setWidth: (width: number) =>
				setState((s) => ({
					...s,
					width: Math.max(minWidth, Math.min(maxWidth, width))
				}))
		}),
		[setState, minWidth, maxWidth]
	)

	return {
		...state,
		...actions
	}
}

// vim: ts=4
