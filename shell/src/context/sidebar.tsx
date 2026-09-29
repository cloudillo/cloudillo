// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's left rail, `lg`+ only: the **app** nav (the context tier lives in the top
 * bar's `ContextBar`), with the context-scoped tools pinned to its bottom. Below `lg` the
 * apps live in the bottom dock and the contexts in the community sheet
 * (`layout/CommunitySheet.tsx`), so the rail is hidden by CSS.
 */

import { mergeClasses, Nav, Text, useAuth, VBox } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

import { Menu } from '../layout/Menu.js'
import { CONTEXT_MENU } from '../manifest-registry.js'
import { scopePath } from '../routes.js'
import { activeContextAtom, contextIdpEnabledAtom, contextSwitchingAtom } from './atoms'
import { useCtx } from './ctx'
import { contextToolAllowed, useSidebar } from './hooks'

/**
 * The bottom block: what acts on the **active context** rather than being an app in it.
 * People and Communities always qualify, `settings` only for a community leader, `idp`
 * only where the context's IdP is enabled, `site-admin` only with the `SADM` role.
 *
 * Mounted twice — once in the `lg`+ rail, once in the mobile community sheet — since these
 * entries have no other route on mobile. It reads nothing but atoms and `useCtx()`, so the
 * duplicate is free.
 */
export function ContextTools({ onNavigate }: { onNavigate?: () => void }) {
	const { t, i18n } = useTranslation()
	const [auth] = useAuth()
	const ctx = useCtx()
	const activeContext = useAtomValue(activeContextAtom)
	const contextIdpEnabled = useAtomValue(contextIdpEnabledAtom)

	const items = CONTEXT_MENU.filter((item) => {
		if (!contextToolAllowed(item.id, activeContext, auth?.idTag, contextIdpEnabled))
			return false
		switch (item.id) {
			// Only a community's own settings belong here — the user menu owns the
			// personal ones. The omnibox does list home settings, on purpose.
			case 'settings':
				return activeContext?.type === 'community'
			case 'idp':
				return true
			default:
				return !item.perm || auth?.roles?.includes(item.perm)
		}
	})
	if (!items.length) return null

	return (
		<VBox className="c-sidebar-context-tools">
			{items.map((item) => {
				const label = item.trans?.[i18n.language] || item.label
				// The context's own name is what the 5rem slot can actually carry;
				// the full "<name> settings" goes to assistive tech.
				const contextName = activeContext?.name ?? activeContext?.idTag ?? ''
				const isCtxSettings = item.id === 'settings'
				return (
					<NavLink
						key={item.id}
						className="c-nav-link vertical"
						to={scopePath(ctx.base, item.path)}
						onClick={onNavigate}
						aria-label={
							isCtxSettings
								? t('{{name}} settings', { name: contextName })
								: undefined
						}
					>
						{item.icon && React.createElement(item.icon)}
						<Text className="c-nav-label">{isCtxSettings ? contextName : label}</Text>
					</NavLink>
				)
			})}
		</VBox>
	)
}

interface SidebarProps {
	className?: string
}

export const Sidebar = React.memo(function Sidebar({ className }: SidebarProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { isPinned } = useSidebar()
	const isSwitching = useAtomValue(contextSwitchingAtom)

	return (
		<aside
			className={mergeClasses(
				'c-sidebar',
				'left',
				isPinned && 'pinned',
				isSwitching && 'switching',
				className
			)}
		>
			<Nav as="nav" vertical className="c-sidebar-apps" aria-label={t('Main navigation')}>
				<Menu vertical />
				{/* Guests get the public apps only — no People/Communities tools. */}
				{auth && <ContextTools />}
			</Nav>
		</aside>
	)
})
