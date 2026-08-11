// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PresenceEntry } from '@cloudillo/core'
import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { AvatarGroup } from '../Avatar/index.js'
import { PresenceAvatar, displayName } from '../Avatar/PresenceAvatar.js'
import { Dropdown } from '../Dropdown/index.js'
import { MenuHeader, MenuItem } from '../Menu/index.js'
import { mergeClasses } from '../utils.js'

export interface DocBarPresenceProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
	/** Roster from `useDocPresence`, already sorted and deduplicated. */
	users?: PresenceEntry[]
	/** Faces shown before the group collapses into a `+N` chip. */
	max?: number
}

/**
 * Who is in this document: a stack of faces that opens the full roster.
 *
 * Renders nothing for an empty roster, so a document whose presence channel is
 * absent or still connecting needs no conditional at the call site.
 */
export function DocBarPresence({ className, users, max = 4, ...props }: DocBarPresenceProps) {
	const { t } = useLibTranslation()
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

	return (
		<Dropdown
			className={mergeClasses('c-docbar-presence', className)}
			placement="bottom-end"
			// The roster rows are `MenuItem`s; without this they are orphaned
			// `role="menuitem"`s and the roster's size is never announced.
			asMenu
			menuLabel={label}
			triggerClassName="c-hbox align-items-center"
			triggerProps={{ title: label, 'aria-label': label }}
			trigger={
				<AvatarGroup max={max} size="sm">
					{users.map((user) => (
						<PresenceAvatar
							key={user.idTag ?? user.connId}
							user={user}
							size="sm"
							guestLabel={guestLabel}
							title={rowLabel(user)}
						/>
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
						<PresenceAvatar
							user={user}
							size="xs"
							guestLabel={guestLabel}
							title={rowLabel(user)}
						/>
					}
					label={rowLabel(user)}
					// Two tabs of one person collapse to one row; say how many.
					shortcut={user.connections > 1 ? `×${user.connections}` : undefined}
					title={user.idTag}
				/>
			))}
		</Dropdown>
	)
}

// vim: ts=4
