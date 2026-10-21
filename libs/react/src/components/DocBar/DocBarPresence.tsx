// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { PresenceEntry } from '@cloudillo/core'
import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { AvatarGroup } from '../Avatar/index.js'
import { displayName, PresenceAvatar } from '../Avatar/PresenceAvatar.js'
import { Dropdown } from '../Dropdown/index.js'
import { MenuHeader, MenuItem } from '../Menu/index.js'
import { PersonHover } from '../Person/index.js'
import { mergeClasses } from '../utils.js'

/**
 * `onUserClick` handed down by `AppDocBar` past `DocBar`, which renders this component
 * and has no prop for it. An explicit `onUserClick` prop wins.
 */
export const DocBarUserClickContext = React.createContext<
	((user: PresenceEntry) => void) | undefined
>(undefined)

export interface DocBarPresenceProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
	/** Roster from `useDocPresence`, already sorted and deduplicated. */
	users?: PresenceEntry[]
	/** Faces shown before the group collapses into a `+N` chip. */
	max?: number
	/**
	 * A collaborator's face or roster row was clicked — e.g. scroll to their caret.
	 * With it, clicking another user's face calls this instead of opening the roster
	 * (your own face and the `+N` chip still open it).
	 */
	onUserClick?(user: PresenceEntry): void
}

/**
 * Who is in this document: a stack of faces that opens the full roster.
 *
 * Renders nothing for an empty roster, so a document whose presence channel is
 * absent or still connecting needs no conditional at the call site.
 */
export function DocBarPresence({
	className,
	users,
	max = 4,
	onUserClick: onUserClickProp,
	...props
}: DocBarPresenceProps) {
	const { t } = useLibTranslation()
	const onUserClickCtx = React.useContext(DocBarUserClickContext)
	const onUserClick = onUserClickProp ?? onUserClickCtx
	const guestLabel = t('Guest')

	// '<name> (you)' / '<name> (guest)' — a guest is anyone with no idTag
	const rowLabel = (user: PresenceEntry) => {
		const name = displayName(user, guestLabel)
		if (user.self) return `${name} (${t('you')})`
		if (!user.idTag) return `${name} (${t('guest')})`
		return name
	}

	if (!users?.length) return null

	// Two explicit keys rather than i18next pluralisation: `useLibTranslation`
	// interpolates the key verbatim when i18n is not initialised, and that path
	// has no plural rules to fall back on.
	const label =
		users.length === 1
			? t('1 collaborator')
			: t('{{count}} collaborators', { count: users.length })

	// The group's children are the visible faces in roster order, then the `+N` chip.
	const visible = users.length > max ? max : users.length
	const onFaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!onUserClick) return
		const faces = [...e.currentTarget.children]
		const idx = faces.findIndex((f) => f.contains(e.target as Node))
		const user = idx >= 0 && idx < visible ? users[idx] : undefined
		if (!user || user.self) return
		// Keep the click from reaching the dropdown trigger.
		e.stopPropagation()
		e.preventDefault()
		onUserClick(user)
	}

	return (
		<Dropdown
			className={mergeClasses('c-docbar-presence', className)}
			placement="bottom-end"
			// The roster rows are `MenuItem`s; without this they are orphaned
			// `role="menuitem"`s and the roster's size is never announced.
			asMenu
			menuLabel={label}
			menuClassName="c-docbar-menu-popper"
			triggerClassName="c-hbox align-items-center"
			triggerProps={{ title: label, 'aria-label': label }}
			trigger={
				<AvatarGroup max={max} size="sm" onClick={onUserClick ? onFaceClick : undefined}>
					{users.map((user) => (
						// Tap opens the roster, so only hover shows the card here
						<PersonHover
							key={user.idTag ?? user.connId}
							idTag={user.idTag ?? ''}
							tapOpens={false}
							disabled={!user.idTag}
						>
							<PresenceAvatar
								user={user}
								size="sm"
								guestLabel={guestLabel}
								title={rowLabel(user)}
							/>
						</PersonHover>
					))}
				</AvatarGroup>
			}
			{...props}
		>
			<MenuHeader>{label}</MenuHeader>
			{users.map((user) => (
				<MenuItem
					key={user.idTag ?? user.connId}
					icon={
						<PersonHover idTag={user.idTag ?? ''} disabled={!user.idTag}>
							<PresenceAvatar
								user={user}
								size="xs"
								guestLabel={guestLabel}
								title={rowLabel(user)}
							/>
						</PersonHover>
					}
					label={rowLabel(user)}
					// Two tabs of one person collapse to one row; say how many.
					shortcut={user.connections > 1 ? `×${user.connections}` : undefined}
					title={user.idTag}
					onClick={onUserClick && !user.self ? () => onUserClick(user) : undefined}
				/>
			))}
		</Dropdown>
	)
}

// vim: ts=4
