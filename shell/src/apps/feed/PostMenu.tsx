// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Popper, useApi, useAuth, useDialog, mergeClasses } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuBell as IcBell,
	LuBellOff as IcMute,
	LuBookmark as IcTrack,
	LuTrash2 as IcDelete,
	LuEllipsis as IcMore
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
			t('Delete this post? This cannot be undone.')
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
		<Popper menuClassName="c-button link" icon={<IcMore />}>
			<ul className="c-nav vertical emph">
				<li>
					<Button
						kind="nav-item"
						className={mergeClasses(subLevel === 'W' && 'active')}
						onClick={() => handleSubscribe('W')}
					>
						<IcBell />
						{t('Watching')}
					</Button>
				</li>
				<li>
					<Button
						kind="nav-item"
						className={mergeClasses(subLevel === 'T' && 'active')}
						onClick={() => handleSubscribe('T')}
					>
						<IcTrack />
						{t('Tracking')}
					</Button>
				</li>
				<li>
					<Button
						kind="nav-item"
						className={mergeClasses(subLevel === 'M' && 'active')}
						onClick={() => handleSubscribe('M')}
					>
						<IcMute />
						{t('Muted')}
					</Button>
				</li>
				{isOwn && (
					<li>
						<Button kind="nav-item" onClick={handleDelete}>
							<IcDelete style={{ color: 'var(--col-error)' }} />
							{t('Delete post')}
						</Button>
					</li>
				)}
			</ul>
		</Popper>
	)
}

// vim: ts=4
