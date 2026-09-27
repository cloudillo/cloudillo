// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Menu, MenuDivider, MenuItem, useApi, useAuth, useDialog } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuBell as IcBell,
	LuTrash2 as IcDelete,
	LuEllipsis as IcMore,
	LuBellOff as IcMute,
	LuBookmark as IcTrack
} from 'react-icons/lu'

type SubLevel = 'W' | 'T' | 'M'

export interface PostMenuProps {
	action: ActionView
	onDelete?: () => void
}

export function PostMenu({ action, onDelete }: PostMenuProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()

	const isOwn = action.issuer.idTag === auth?.idTag
	const [subLevel, setSubLevel] = React.useState<SubLevel | null>(action.subLevel ?? null)
	const pendingRef = React.useRef(false)

	// Keep in sync if the action refreshes with a server-provided level.
	React.useEffect(() => {
		if (pendingRef.current) return // don't clobber an in-flight optimistic toggle
		setSubLevel(action.subLevel ?? null)
	}, [action.subLevel])

	async function handleSubscribe(level: SubLevel) {
		if (!api) return
		const newLevel = level === subLevel ? null : level // toggle off when re-selected
		const prev = subLevel
		pendingRef.current = true
		setSubLevel(newLevel)
		try {
			await api.actions.subscribe(action.actionId, newLevel)
		} catch (e) {
			console.error('Failed to update subscription', e)
			setSubLevel(prev) // revert on failure
		} finally {
			pendingRef.current = false
		}
	}

	async function handleDelete() {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Delete post'),
			t('Delete this post? This cannot be undone.'),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (!confirmed) return

		try {
			await api.actions.delete(action.actionId)
			onDelete?.()
		} catch (e) {
			console.error('Failed to delete post', e)
		}
	}

	// Subscribe controls are available to any signed-in user; delete to the owner.
	if (!auth) return null

	return (
		<Menu
			placement="bottom-end"
			trigger={<Button variant="ghost" icon={<IcMore />} aria-label={t('More actions')} />}
		>
			<MenuItem
				icon={<IcBell />}
				label={t('Watching')}
				selected={subLevel === 'W'}
				onClick={() => handleSubscribe('W')}
			/>
			<MenuItem
				icon={<IcTrack />}
				label={t('Tracking')}
				selected={subLevel === 'T'}
				onClick={() => handleSubscribe('T')}
			/>
			<MenuItem
				icon={<IcMute />}
				label={t('Muted')}
				selected={subLevel === 'M'}
				onClick={() => handleSubscribe('M')}
			/>
			{isOwn && <MenuDivider />}
			{isOwn && (
				<MenuItem
					icon={<IcDelete />}
					label={t('Delete post')}
					color="error"
					onClick={handleDelete}
				/>
			)}
		</Menu>
	)
}

// vim: ts=4
