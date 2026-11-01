// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Button,
	friendlyError,
	IcDelete,
	IcMore,
	Menu,
	MenuDivider,
	MenuItem,
	useApi,
	useAuth,
	useDialog,
	useToast
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcMute, IcTrack, IcWatch } from '../../icons.js'

type SubLevel = 'W' | 'T' | 'M'

/** A stored notify level; an unknown (newer) one reads as 'W' */
function subLevel(notify: string | undefined): SubLevel | null {
	if (!notify) return null
	return notify === 'T' || notify === 'M' ? notify : 'W'
}

export interface PostMenuProps {
	action: ActionView
	onDelete?: () => void
}

export function PostMenu({ action, onDelete }: PostMenuProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()
	const toast = useToast()

	const isOwn = action.issuer.idTag === auth?.idTag
	const [notifyLevel, setSubLevel] = React.useState<SubLevel | null>(
		subLevel(action.readerState?.notify)
	)
	const pendingRef = React.useRef(false)

	// Keep in sync if the action refreshes with a server-provided level.
	React.useEffect(() => {
		if (pendingRef.current) return // don't clobber an in-flight optimistic toggle
		setSubLevel(subLevel(action.readerState?.notify))
	}, [action.readerState?.notify])

	async function handleSubscribe(level: SubLevel) {
		if (!api) return
		const newLevel = level === notifyLevel ? null : level // toggle off when re-selected
		const prev = notifyLevel
		pendingRef.current = true
		setSubLevel(newLevel)
		try {
			await api.readerState.patch('A', action.actionId, { notify: newLevel })
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
			toast.error(friendlyError(t, e))
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
				icon={<IcWatch />}
				label={t('Watching')}
				selected={notifyLevel === 'W'}
				onClick={() => handleSubscribe('W')}
			/>
			<MenuItem
				icon={<IcTrack />}
				label={t('Tracking')}
				selected={notifyLevel === 'T'}
				onClick={() => handleSubscribe('T')}
			/>
			<MenuItem
				icon={<IcMute />}
				label={t('Muted')}
				selected={notifyLevel === 'M'}
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
