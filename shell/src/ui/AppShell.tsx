// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { mergeClasses, SkipLink, useAuth } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useLocation } from 'react-router-dom'

import {
	activeContextAtom,
	activePinKey,
	contextColorsAtom,
	favoritesAtom,
	partnerCommunitiesAtom
} from '../context/atoms.js'
import { resolveContextColor } from '../context/context-colors.js'
import { ErrorBoundary } from '../ErrorBoundary.js'
import { getShellBus } from '../message-bus/index.js'
import { matchAppRoute } from '../routes.js'

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
	const { pathname } = useLocation()
	const docMode = !!matchAppRoute(pathname)?.resId
	const [auth] = useAuth()
	const active = useAtomValue(activeContextAtom)
	const favorites = useAtomValue(favoritesAtom)
	const partners = useAtomValue(partnerCommunitiesAtom)
	const colors = useAtomValue(contextColorsAtom)
	const community = active?.type === 'community'
	// Home is keyed by the user's own idTag; a community only by its pin (unpinned → default).
	const ctxColor = community
		? resolveContextColor(colors, activePinKey(favorites, active, partners), false)
		: auth?.idTag && resolveContextColor(colors, auth.idTag, true)

	// On :root like AppFrame's `data-app-frame`: app-shell.css combines the two below md into
	// mobile doc mode (no dock, slim header) and tints the rail in a community context.
	React.useEffect(() => {
		const root = document.documentElement.dataset
		if (docMode) root.docMode = ''
		else delete root.docMode
		if (community) root.community = ''
		else delete root.community
		if (ctxColor) root.ctxColor = ctxColor
		else delete root.ctxColor
		return () => {
			delete root.docMode
			delete root.community
			delete root.ctxColor
		}
	}, [docMode, community, ctxColor])

	// Apps carry the same seed in their own document (inline `--color-neutral`). Declared after the
	// dataset effect, so it runs after `ctxColor` is applied and the body's computed
	// `--color-neutral` is current; on mount no app is initialized yet, so it posts nothing.
	React.useEffect(() => {
		getShellBus()?.broadcastThemeUpdate()
	}, [community, ctxColor])

	return (
		<>
			<SkipLink href="#main-content" />
			{sidebar}
			{header}
			<div className={mergeClasses('c-layout', sidebarPinned && 'with-sidebar')}>
				<ErrorBoundary>
					<div id="main-content" inert={inert} className="c-vbox flex-fill h-min-0">
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
