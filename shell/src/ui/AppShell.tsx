// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { mergeClasses, SkipLink } from '@cloudillo/react'
import * as React from 'react'

import { ErrorBoundary } from '../ErrorBoundary.js'

import './app-shell.css'

export interface AppShellProps {
	/** The top header; the mobile dock rides along with it (see `AppDock`). */
	header: React.ReactNode
	/** The context sidebar (drawer below lg, rail when pinned). */
	sidebar?: React.ReactNode
	/** Shifts the content past the pinned sidebar. */
	sidebarPinned?: boolean
	/** Makes the main content inert, e.g. while a dialog is open. */
	inert?: boolean
	children: React.ReactNode
}

/** The shell frame — skip link, sidebar, header, the main region and the popper host. */
export function AppShell({ header, sidebar, sidebarPinned, inert, children }: AppShellProps) {
	return (
		<>
			<SkipLink href="#main-content" />
			{sidebar}
			{header}
			<div className={mergeClasses('c-layout', sidebarPinned && 'with-sidebar')}>
				<ErrorBoundary>
					<div id="main-content" inert={inert} className="c-vbox flex-fill h-min-0 mb-1">
						{children}
					</div>
				</ErrorBoundary>
			</div>
			{/* Portal target for poppers (omnibox, app menu, community sheet, ActionSheet). */}
			<div id="popper-container" />
		</>
	)
}

// vim: ts=4
